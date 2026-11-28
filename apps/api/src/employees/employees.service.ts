import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { type Database, employeeIdSequences, employees, users } from "@starter/db";
import {
  type CreateEmployeeDto,
  type Employee,
  type EmployeeDetail,
  type EmployeeSupervisorSummary,
  HRIS_REFERENCES,
  type ListEmployeesQuery,
  type PaginatedResponse,
  type ReferenceOption,
  type UpdateEmployeeDto,
  type User,
} from "@starter/shared";
import { and, asc, count, desc, eq, gte, ilike, lte, ne, or, type SQL, sql } from "drizzle-orm";
import { hashPassword } from "../auth/password.js";
import { DB } from "../database/database.module.js";

const publicUserColumns = {
  id: users.id,
  employeeId: users.employeeId,
  roleId: users.roleId,
  email: users.email,
  name: users.name,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const pgError = error as { code?: string; cause?: { code?: string } };
  return pgError.code === "23505" || pgError.cause?.code === "23505";
}

function expandReferenceMatches(input: string, catalog?: readonly ReferenceOption[]): string[] {
  const normalized = input.trim().toLowerCase();
  const candidates = new Set<string>([normalized]);
  if (catalog) {
    for (const option of catalog) {
      if (option.code.toLowerCase() === normalized || option.label.toLowerCase() === normalized) {
        candidates.add(option.code.toLowerCase());
        candidates.add(option.label.toLowerCase());
      }
    }
  }
  return [...candidates];
}

function matchCaseInsensitiveValues(
  column: Parameters<typeof ilike>[0],
  values: string[],
): SQL | undefined {
  if (values.length === 0) {
    return undefined;
  }
  const checks = values.map((v) => sql`lower(${column}) = ${v}`);
  return checks.length === 1 ? checks[0] : or(...checks);
}

@Injectable()
export class EmployeesService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async findAll(query: ListEmployeesQuery): Promise<PaginatedResponse<Employee>> {
    const conditions: SQL[] = [];

    if (query.search) {
      const pattern = `%${query.search}%`;
      const fullNameExpr = sql`${employees.firstName} || ' ' || ${employees.lastName}`;
      const searchCond = or(
        ilike(employees.employeeId, pattern),
        ilike(employees.firstName, pattern),
        ilike(employees.lastName, pattern),
        ilike(fullNameExpr, pattern),
        ilike(employees.personalEmail, pattern),
        ilike(employees.workEmail, pattern),
      );
      if (searchCond) {
        conditions.push(searchCond);
      }
    }

    const addRefFilter = (
      value: string | undefined,
      column: Parameters<typeof ilike>[0],
      catalog?: readonly ReferenceOption[],
    ) => {
      if (!value) {
        return;
      }
      const cond = matchCaseInsensitiveValues(column, expandReferenceMatches(value, catalog));
      if (cond) {
        conditions.push(cond);
      }
    };

    addRefFilter(query.office, employees.office);
    addRefFilter(query.department, employees.department);
    addRefFilter(query.position, employees.position);
    addRefFilter(
      query.employmentStatus,
      employees.employmentStatus,
      HRIS_REFERENCES.employmentStatuses,
    );
    addRefFilter(query.type, employees.type, HRIS_REFERENCES.employeeTypes);
    addRefFilter(
      query.workArrangement,
      employees.workArrangement,
      HRIS_REFERENCES.workArrangements,
    );
    addRefFilter(query.gender, employees.gender, HRIS_REFERENCES.genders);
    addRefFilter(query.civilStatus, employees.civilStatus, HRIS_REFERENCES.civilStatuses);
    addRefFilter(
      query.employeeCategory,
      employees.employeeCategory,
      HRIS_REFERENCES.employeeCategories,
    );

    if (query.dateFrom) {
      conditions.push(gte(employees.createdAt, new Date(`${query.dateFrom}T00:00:00.000Z`)));
    }
    if (query.dateTo) {
      conditions.push(lte(employees.createdAt, new Date(`${query.dateTo}T23:59:59.999Z`)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const sortColumn =
      query.sortBy === "id"
        ? employees.id
        : query.sortBy === "employeeId"
          ? employees.employeeId
          : query.sortBy === "firstName"
            ? employees.firstName
            : query.sortBy === "lastName"
              ? employees.lastName
              : query.sortBy === "dateHired"
                ? employees.dateHired
                : employees.createdAt;
    const orderByExpr = query.sortDir === "asc" ? asc(sortColumn) : desc(sortColumn);
    const offset = (query.page - 1) * query.pageSize;

    const [totalRow] = await this.db.select({ value: count() }).from(employees).where(whereClause);

    const total = Number(totalRow?.value ?? 0);
    const data = await this.db
      .select()
      .from(employees)
      .where(whereClause)
      .orderBy(orderByExpr)
      .limit(query.pageSize)
      .offset(offset);

    return {
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async findOne(employeeId: string): Promise<EmployeeDetail> {
    const [employee] = await this.db
      .select()
      .from(employees)
      .where(eq(employees.employeeId, employeeId))
      .limit(1);

    if (!employee) {
      throw new NotFoundException(`Employee ${employeeId} not found`);
    }

    const supervisor = await this.loadSupervisor(this.db, employee.reportsToEmployeeId);
    const [account] = await this.db
      .select(publicUserColumns)
      .from(users)
      .where(eq(users.employeeId, employeeId))
      .limit(1);

    return {
      employee,
      supervisor,
      account: account ?? null,
    };
  }

  async create(dto: CreateEmployeeDto): Promise<EmployeeDetail> {
    const initialPasswordHash = await hashPassword(dto.lastName.trim().toUpperCase());

    try {
      return await this.db.transaction(async (tx) => {
        const [existingEmail] = await tx
          .select({ id: users.id })
          .from(users)
          .where(sql`lower(${users.email}) = ${dto.personalEmail.toLowerCase()}`)
          .limit(1);

        if (existingEmail) {
          throw new ConflictException(`Email ${dto.personalEmail} is already in use`);
        }

        let supervisor: EmployeeSupervisorSummary | null = null;
        if (dto.reportsToEmployeeId) {
          supervisor = await this.loadSupervisor(tx, dto.reportsToEmployeeId);
          if (!supervisor) {
            throw new BadRequestException(`Supervisor ${dto.reportsToEmployeeId} does not exist`);
          }
        }

        const year = new Date().getUTCFullYear();
        const [seq] = await tx
          .insert(employeeIdSequences)
          .values({ year, lastSeq: 1 })
          .onConflictDoUpdate({
            target: employeeIdSequences.year,
            set: { lastSeq: sql`${employeeIdSequences.lastSeq} + 1` },
          })
          .returning();

        const nextSeq = seq?.lastSeq ?? 1;
        const employeeId = `EMP-${year}${String(nextSeq).padStart(4, "0")}`;

        const [employee] = await tx
          .insert(employees)
          .values({
            ...dto,
            employeeId,
            employmentStatus: dto.employmentStatus || "ACTIVE",
            languages: dto.languages ?? null,
          })
          .returning();

        if (!employee) {
          throw new Error("Failed to create employee record");
        }

        const [account] = await tx
          .insert(users)
          .values({
            employeeId,
            name: `${dto.firstName} ${dto.lastName}`.trim(),
            email: dto.personalEmail,
            passwordHash: initialPasswordHash,
          })
          .returning(publicUserColumns);

        return {
          employee,
          supervisor,
          account: account ?? null,
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`Email ${dto.personalEmail} is already in use`);
      }
      throw error;
    }
  }

  async update(employeeId: string, dto: UpdateEmployeeDto): Promise<EmployeeDetail> {
    try {
      return await this.db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(employees)
          .where(eq(employees.employeeId, employeeId))
          .for("update")
          .limit(1);

        if (!current) {
          throw new NotFoundException(`Employee ${employeeId} not found`);
        }

        if (dto.reportsToEmployeeId !== undefined && dto.reportsToEmployeeId !== null) {
          if (dto.reportsToEmployeeId === employeeId) {
            throw new BadRequestException("An employee cannot report to themselves");
          }
          const targetSupervisor = await this.loadSupervisor(tx, dto.reportsToEmployeeId);
          if (!targetSupervisor) {
            throw new BadRequestException(`Supervisor ${dto.reportsToEmployeeId} does not exist`);
          }
        }

        const [linkedAccount] = await tx
          .select(publicUserColumns)
          .from(users)
          .where(eq(users.employeeId, employeeId))
          .limit(1);

        if (dto.personalEmail) {
          const emailCheckConditions = [
            sql`lower(${users.email}) = ${dto.personalEmail.toLowerCase()}`,
          ];
          if (linkedAccount) {
            emailCheckConditions.push(ne(users.id, linkedAccount.id));
          }
          const [conflictUser] = await tx
            .select({ id: users.id })
            .from(users)
            .where(and(...emailCheckConditions))
            .limit(1);

          if (conflictUser) {
            throw new ConflictException(`Email ${dto.personalEmail} is already in use`);
          }
        }

        const [updated] = await tx
          .update(employees)
          .set({
            ...dto,
            updatedAt: new Date(),
          })
          .where(eq(employees.employeeId, employeeId))
          .returning();

        if (!updated) {
          throw new NotFoundException(`Employee ${employeeId} not found`);
        }

        let syncedAccount: User | null = linkedAccount ?? null;
        if (linkedAccount) {
          const nextName = `${updated.firstName} ${updated.lastName}`.trim();
          const nextEmail = updated.personalEmail || linkedAccount.email;
          const [updatedUser] = await tx
            .update(users)
            .set({
              name: nextName,
              email: nextEmail,
              updatedAt: new Date(),
            })
            .where(eq(users.id, linkedAccount.id))
            .returning(publicUserColumns);
          syncedAccount = updatedUser ?? linkedAccount;
        }

        const supervisor = await this.loadSupervisor(tx, updated.reportsToEmployeeId);

        return {
          employee: updated,
          supervisor,
          account: syncedAccount,
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("Email is already in use");
      }
      throw error;
    }
  }

  private async loadSupervisor(
    executor: Pick<Database, "select">,
    reportsToEmployeeId: string | null | undefined,
  ): Promise<EmployeeSupervisorSummary | null> {
    if (!reportsToEmployeeId) {
      return null;
    }
    const [row] = await executor
      .select({
        employeeId: employees.employeeId,
        firstName: employees.firstName,
        lastName: employees.lastName,
        position: employees.position,
      })
      .from(employees)
      .where(eq(employees.employeeId, reportsToEmployeeId))
      .limit(1);

    return row ?? null;
  }
}
