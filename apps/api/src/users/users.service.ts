import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { type Database, roles, users } from "@starter/db";
import type {
  CreateUserDto,
  ListUsersQuery,
  PaginatedResponse,
  UpdateUserDto,
  User,
} from "@starter/shared";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  not,
  or,
  type SQL,
} from "drizzle-orm";
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

@Injectable()
export class UsersService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async findAll(query: ListUsersQuery): Promise<PaginatedResponse<User>> {
    const conditions: SQL[] = [];

    if (query.search) {
      const pattern = `%${query.search}%`;
      const searchCond = or(
        ilike(users.name, pattern),
        ilike(users.email, pattern),
        ilike(users.employeeId, pattern),
      );
      if (searchCond) {
        conditions.push(searchCond);
      }
    }

    if (query.roleId !== undefined) {
      conditions.push(eq(users.roleId, query.roleId));
    } else if (query.role === "admin") {
      const adminCond = or(ilike(users.email, "%admin%"), ilike(users.name, "%admin%"));
      if (adminCond) {
        conditions.push(adminCond);
      }
    } else if (query.role === "member") {
      const adminCond = or(ilike(users.email, "%admin%"), ilike(users.name, "%admin%"));
      if (adminCond) {
        conditions.push(not(adminCond));
      }
    }

    if (query.createdFrom) {
      conditions.push(gte(users.createdAt, new Date(`${query.createdFrom}T00:00:00Z`)));
    }
    if (query.createdTo) {
      conditions.push(lte(users.createdAt, new Date(`${query.createdTo}T23:59:59.999Z`)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const sortColumn =
      query.sortBy === "name"
        ? users.name
        : query.sortBy === "email"
          ? users.email
          : query.sortBy === "employeeId"
            ? users.employeeId
            : query.sortBy === "roleId"
              ? users.roleId
              : users.createdAt;
    const orderByExpr = query.sortDir === "asc" ? asc(sortColumn) : desc(sortColumn);

    const offset = (query.page - 1) * query.pageSize;

    const [totalRow] = await this.db.select({ value: count() }).from(users).where(whereClause);

    const total = Number(totalRow?.value ?? 0);
    const rows = await this.db
      .select(publicUserColumns)
      .from(users)
      .where(whereClause)
      .orderBy(orderByExpr)
      .limit(query.pageSize)
      .offset(offset);

    const roleIds = Array.from(
      new Set(rows.map((u) => u.roleId).filter((id): id is number => id !== null)),
    );
    const roleRows =
      roleIds.length > 0
        ? await this.db
            .select({ id: roles.id, code: roles.code, name: roles.name })
            .from(roles)
            .where(inArray(roles.id, roleIds))
        : [];
    const roleMap = new Map(roleRows.map((r) => [r.id, r]));

    const data: User[] = rows.map((u) => {
      const role = u.roleId !== null ? roleMap.get(u.roleId) : undefined;
      return {
        ...u,
        roleCode: role?.code ?? null,
        roleName: role?.name ?? null,
      };
    });

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

  async findOne(id: string): Promise<User> {
    const [user] = await this.db
      .select(publicUserColumns)
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  async create(dto: CreateUserDto): Promise<User> {
    try {
      const [created] = await this.db.insert(users).values(dto).returning(publicUserColumns);
      if (!created) {
        throw new Error("Failed to create user");
      }
      return created;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`Email ${dto.email} is already in use`);
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    try {
      const [updated] = await this.db
        .update(users)
        .set({ ...dto, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning(publicUserColumns);
      if (!updated) {
        throw new NotFoundException(`User ${id} not found`);
      }
      return updated;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("Email is already in use");
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const [deleted] = await this.db
      .delete(users)
      .where(eq(users.id, id))
      .returning({ id: users.id });
    if (!deleted) {
      throw new NotFoundException(`User ${id} not found`);
    }
  }
}
