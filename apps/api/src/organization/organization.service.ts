import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  type Database,
  departments,
  divisions,
  employees,
  offices,
  positions,
  reportsItems,
  sections,
} from "@starter/db";
import {
  createDepartmentSchema,
  createDivisionSchema,
  createOfficeSchema,
  createPositionSchema,
  createReportsItemSchema,
  createSectionSchema,
  type ListOrgQuery,
  type OfficeType,
  type OrgActiveOptions,
  type OrgEntityType,
  type OrgHierarchyTree,
  type OrgRecord,
  type OrgSummaryCounts,
  type OrgTreeDepartmentNode,
  type OrgTreeDivisionNode,
  type OrgTreeOfficeNode,
  type PaginatedResponse,
  type UsageMetadata,
  updateDepartmentSchema,
  updateDivisionSchema,
  updateOfficeSchema,
  updatePositionSchema,
  updateReportsItemSchema,
  updateSectionSchema,
} from "@starter/shared";
import { and, asc, count, desc, eq, ilike, inArray, or, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { DB } from "../database/database.module.js";

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const pgError = error as { code?: string; cause?: { code?: string } };
  return pgError.code === "23505" || pgError.cause?.code === "23505";
}

function parseOrThrow<T>(
  schema: {
    safeParse: (input: unknown) => {
      success: boolean;
      data?: T;
      error?: { issues: Array<{ message: string }> };
    };
  },
  input: unknown,
): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const msg = result.error?.issues.map((i) => i.message).join("; ") ?? "Validation failed";
    throw new BadRequestException(msg);
  }
  return result.data as T;
}

function formatUsageReason(parts: Array<{ count: number; label: string }>): UsageMetadata {
  const active = parts.filter((p) => p.count > 0);
  const usageCount = active.reduce((sum, p) => sum + p.count, 0);
  if (usageCount === 0) {
    return { usageCount: 0, isInUse: false, usageReason: null };
  }
  const detail = active.map((p) => `${p.count} ${p.label}${p.count === 1 ? "" : "s"}`).join(", ");
  return {
    usageCount,
    isInUse: true,
    usageReason: `Referenced by ${detail}. Deactivate instead of deleting.`,
  };
}

@Injectable()
export class OrganizationService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async getSummary(): Promise<OrgSummaryCounts> {
    const countTable = async (
      table:
        | typeof offices
        | typeof departments
        | typeof divisions
        | typeof sections
        | typeof positions
        | typeof reportsItems,
    ) => {
      const [row] = await this.db
        .select({
          total: count(),
          active: sql<number>`count(*) filter (where ${table.isActive} = true)`,
        })
        .from(table);
      return {
        total: Number(row?.total ?? 0),
        active: Number(row?.active ?? 0),
      };
    };

    const [
      officesCount,
      departmentsCount,
      divisionsCount,
      sectionsCount,
      positionsCount,
      reportsItemsCount,
    ] = await Promise.all([
      countTable(offices),
      countTable(departments),
      countTable(divisions),
      countTable(sections),
      countTable(positions),
      countTable(reportsItems),
    ]);

    return {
      offices: officesCount,
      departments: departmentsCount,
      divisions: divisionsCount,
      sections: sectionsCount,
      positions: positionsCount,
      reports_items: reportsItemsCount,
    };
  }

  async getActiveOptions(): Promise<OrgActiveOptions> {
    const [officeRows, departmentRows, divisionRows, sectionRows, positionRows, reportsItemRows] =
      await Promise.all([
        this.db
          .select()
          .from(offices)
          .where(eq(offices.isActive, true))
          .orderBy(asc(offices.sortOrder), asc(offices.name)),
        this.db
          .select()
          .from(departments)
          .where(eq(departments.isActive, true))
          .orderBy(asc(departments.sortOrder), asc(departments.name)),
        this.db
          .select()
          .from(divisions)
          .where(eq(divisions.isActive, true))
          .orderBy(asc(divisions.sortOrder), asc(divisions.name)),
        this.db
          .select()
          .from(sections)
          .where(eq(sections.isActive, true))
          .orderBy(asc(sections.sortOrder), asc(sections.name)),
        this.db
          .select()
          .from(positions)
          .where(eq(positions.isActive, true))
          .orderBy(asc(positions.sortOrder), asc(positions.title)),
        this.db
          .select()
          .from(reportsItems)
          .where(eq(reportsItems.isActive, true))
          .orderBy(asc(reportsItems.sortOrder), asc(reportsItems.name)),
      ]);

    return {
      offices: officeRows.map((o) => ({
        id: o.id,
        code: o.code,
        label: o.name,
        parentId: o.parentId,
      })),
      departments: departmentRows.map((d) => ({
        id: d.id,
        code: d.code,
        label: d.name,
        officeId: d.officeId,
      })),
      divisions: divisionRows.map((d) => ({
        id: d.id,
        code: d.code,
        label: d.name,
        departmentId: d.departmentId,
      })),
      sections: sectionRows.map((s) => ({
        id: s.id,
        code: s.code,
        label: s.name,
        departmentId: s.departmentId,
        divisionId: s.divisionId,
      })),
      positions: positionRows.map((p) => ({
        id: p.id,
        code: p.code,
        label: p.title,
        departmentId: p.departmentId,
        divisionId: p.divisionId,
        sectionId: p.sectionId,
      })),
      reports_items: reportsItemRows.map((r) => ({
        id: r.id,
        code: r.code,
        label: r.name,
        officeId: r.officeId,
        departmentId: r.departmentId,
        divisionId: r.divisionId,
        sectionId: r.sectionId,
      })),
    };
  }

  async getTree(includeInactive: boolean): Promise<OrgHierarchyTree> {
    const [officeRows, deptRows, divRows, secRows] = await Promise.all([
      this.db
        .select()
        .from(offices)
        .where(includeInactive ? undefined : eq(offices.isActive, true))
        .orderBy(asc(offices.sortOrder), asc(offices.id)),
      this.db
        .select()
        .from(departments)
        .where(includeInactive ? undefined : eq(departments.isActive, true))
        .orderBy(asc(departments.sortOrder), asc(departments.id)),
      this.db
        .select()
        .from(divisions)
        .where(includeInactive ? undefined : eq(divisions.isActive, true))
        .orderBy(asc(divisions.sortOrder), asc(divisions.id)),
      this.db
        .select()
        .from(sections)
        .where(includeInactive ? undefined : eq(sections.isActive, true))
        .orderBy(asc(sections.sortOrder), asc(sections.id)),
    ]);

    const sectionsByDivision = new Map<number, OrgTreeDivisionNode["sections"]>();
    const directSectionsByDept = new Map<number, OrgTreeDepartmentNode["sections"]>();
    for (const sec of secRows) {
      const node = { id: sec.id, code: sec.code, name: sec.name, isActive: sec.isActive };
      if (sec.divisionId) {
        const list = sectionsByDivision.get(sec.divisionId) ?? [];
        list.push(node);
        sectionsByDivision.set(sec.divisionId, list);
      } else if (sec.departmentId) {
        const list = directSectionsByDept.get(sec.departmentId) ?? [];
        list.push(node);
        directSectionsByDept.set(sec.departmentId, list);
      }
    }

    const divisionsByDept = new Map<number, OrgTreeDivisionNode[]>();
    for (const div of divRows) {
      const node: OrgTreeDivisionNode = {
        id: div.id,
        code: div.code,
        name: div.name,
        isActive: div.isActive,
        sections: sectionsByDivision.get(div.id) ?? [],
      };
      if (div.departmentId) {
        const list = divisionsByDept.get(div.departmentId) ?? [];
        list.push(node);
        divisionsByDept.set(div.departmentId, list);
      }
    }

    const deptsByOffice = new Map<number, OrgTreeDepartmentNode[]>();
    const unassignedDepartments: OrgTreeDepartmentNode[] = [];
    for (const dept of deptRows) {
      const node: OrgTreeDepartmentNode = {
        id: dept.id,
        code: dept.code,
        name: dept.name,
        isActive: dept.isActive,
        divisions: divisionsByDept.get(dept.id) ?? [],
        sections: directSectionsByDept.get(dept.id) ?? [],
      };
      if (dept.officeId) {
        const list = deptsByOffice.get(dept.officeId) ?? [];
        list.push(node);
        deptsByOffice.set(dept.officeId, list);
      } else {
        unassignedDepartments.push(node);
      }
    }

    const officeNodeMap = new Map<number, OrgTreeOfficeNode>();
    for (const office of officeRows) {
      officeNodeMap.set(office.id, {
        id: office.id,
        code: office.code,
        name: office.name,
        type: office.type as OfficeType,
        isActive: office.isActive,
        children: [],
        departments: deptsByOffice.get(office.id) ?? [],
      });
    }

    const rootOffices: OrgTreeOfficeNode[] = [];
    for (const office of officeRows) {
      const node = officeNodeMap.get(office.id);
      if (!node) {
        continue;
      }
      const parent = office.parentId ? officeNodeMap.get(office.parentId) : undefined;
      if (parent && parent.id !== node.id) {
        parent.children.push(node);
      } else {
        rootOffices.push(node);
      }
    }

    return { offices: rootOffices, unassignedDepartments };
  }

  async list(entity: OrgEntityType, query: ListOrgQuery): Promise<PaginatedResponse<OrgRecord>> {
    const offset = (query.page - 1) * query.pageSize;
    const conditions: SQL[] = [];

    const buildStatusCondition = (isActiveCol: AnyPgColumn) => {
      if (query.status === "active") {
        conditions.push(eq(isActiveCol, true));
      } else if (query.status === "inactive") {
        conditions.push(eq(isActiveCol, false));
      }
    };

    const sortDirFn = query.sortDir === "desc" ? desc : asc;

    if (entity === "offices") {
      buildStatusCondition(offices.isActive);
      if (query.type) {
        conditions.push(eq(offices.type, query.type));
      }
      if (query.search) {
        const p = `%${query.search}%`;
        const c = or(
          ilike(offices.code, p),
          ilike(offices.name, p),
          ilike(offices.shortName, p),
          ilike(offices.description, p),
        );
        if (c) conditions.push(c);
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const sortCol =
        query.sortBy === "code"
          ? offices.code
          : query.sortBy === "name"
            ? offices.name
            : query.sortBy === "id"
              ? offices.id
              : query.sortBy === "createdAt"
                ? offices.createdAt
                : offices.sortOrder;

      const [[totalRow], rows] = await Promise.all([
        this.db.select({ value: count() }).from(offices).where(where),
        this.db
          .select()
          .from(offices)
          .where(where)
          .orderBy(sortDirFn(sortCol), asc(offices.id))
          .limit(query.pageSize)
          .offset(offset),
      ]);

      const usageMap = await this.computeUsageMap("offices", rows);
      return this.wrapPage(rows, usageMap, Number(totalRow?.value ?? 0), query);
    }

    if (entity === "departments") {
      buildStatusCondition(departments.isActive);
      if (query.officeId) {
        conditions.push(eq(departments.officeId, query.officeId));
      }
      if (query.search) {
        const p = `%${query.search}%`;
        const c = or(
          ilike(departments.code, p),
          ilike(departments.name, p),
          ilike(departments.shortName, p),
        );
        if (c) conditions.push(c);
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const sortCol =
        query.sortBy === "code"
          ? departments.code
          : query.sortBy === "name"
            ? departments.name
            : query.sortBy === "id"
              ? departments.id
              : query.sortBy === "createdAt"
                ? departments.createdAt
                : departments.sortOrder;

      const [[totalRow], rows] = await Promise.all([
        this.db.select({ value: count() }).from(departments).where(where),
        this.db
          .select()
          .from(departments)
          .where(where)
          .orderBy(sortDirFn(sortCol), asc(departments.id))
          .limit(query.pageSize)
          .offset(offset),
      ]);

      const usageMap = await this.computeUsageMap("departments", rows);
      return this.wrapPage(rows, usageMap, Number(totalRow?.value ?? 0), query);
    }

    if (entity === "divisions") {
      buildStatusCondition(divisions.isActive);
      if (query.departmentId) {
        conditions.push(eq(divisions.departmentId, query.departmentId));
      }
      if (query.search) {
        const p = `%${query.search}%`;
        const c = or(
          ilike(divisions.code, p),
          ilike(divisions.name, p),
          ilike(divisions.shortName, p),
        );
        if (c) conditions.push(c);
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const sortCol =
        query.sortBy === "code"
          ? divisions.code
          : query.sortBy === "name"
            ? divisions.name
            : query.sortBy === "id"
              ? divisions.id
              : query.sortBy === "createdAt"
                ? divisions.createdAt
                : divisions.sortOrder;

      const [[totalRow], rows] = await Promise.all([
        this.db.select({ value: count() }).from(divisions).where(where),
        this.db
          .select()
          .from(divisions)
          .where(where)
          .orderBy(sortDirFn(sortCol), asc(divisions.id))
          .limit(query.pageSize)
          .offset(offset),
      ]);

      const usageMap = await this.computeUsageMap("divisions", rows);
      return this.wrapPage(rows, usageMap, Number(totalRow?.value ?? 0), query);
    }

    if (entity === "sections") {
      buildStatusCondition(sections.isActive);
      if (query.departmentId) {
        conditions.push(eq(sections.departmentId, query.departmentId));
      }
      if (query.divisionId) {
        conditions.push(eq(sections.divisionId, query.divisionId));
      }
      if (query.search) {
        const p = `%${query.search}%`;
        const c = or(
          ilike(sections.code, p),
          ilike(sections.name, p),
          ilike(sections.shortName, p),
        );
        if (c) conditions.push(c);
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const sortCol =
        query.sortBy === "code"
          ? sections.code
          : query.sortBy === "name"
            ? sections.name
            : query.sortBy === "id"
              ? sections.id
              : query.sortBy === "createdAt"
                ? sections.createdAt
                : sections.sortOrder;

      const [[totalRow], rows] = await Promise.all([
        this.db.select({ value: count() }).from(sections).where(where),
        this.db
          .select()
          .from(sections)
          .where(where)
          .orderBy(sortDirFn(sortCol), asc(sections.id))
          .limit(query.pageSize)
          .offset(offset),
      ]);

      const usageMap = await this.computeUsageMap("sections", rows);
      return this.wrapPage(rows, usageMap, Number(totalRow?.value ?? 0), query);
    }

    if (entity === "positions") {
      buildStatusCondition(positions.isActive);
      if (query.departmentId) {
        conditions.push(eq(positions.departmentId, query.departmentId));
      }
      if (query.divisionId) {
        conditions.push(eq(positions.divisionId, query.divisionId));
      }
      if (query.search) {
        const p = `%${query.search}%`;
        const c = or(
          ilike(positions.code, p),
          ilike(positions.title, p),
          ilike(positions.salaryGrade, p),
          ilike(positions.jobLevel, p),
        );
        if (c) conditions.push(c);
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const sortCol =
        query.sortBy === "code"
          ? positions.code
          : query.sortBy === "title" || query.sortBy === "name"
            ? positions.title
            : query.sortBy === "id"
              ? positions.id
              : query.sortBy === "createdAt"
                ? positions.createdAt
                : positions.sortOrder;

      const [[totalRow], rows] = await Promise.all([
        this.db.select({ value: count() }).from(positions).where(where),
        this.db
          .select()
          .from(positions)
          .where(where)
          .orderBy(sortDirFn(sortCol), asc(positions.id))
          .limit(query.pageSize)
          .offset(offset),
      ]);

      const usageMap = await this.computeUsageMap("positions", rows);
      return this.wrapPage(rows, usageMap, Number(totalRow?.value ?? 0), query);
    }

    // reports_items
    buildStatusCondition(reportsItems.isActive);
    if (query.officeId) {
      conditions.push(eq(reportsItems.officeId, query.officeId));
    }
    if (query.departmentId) {
      conditions.push(eq(reportsItems.departmentId, query.departmentId));
    }
    if (query.search) {
      const p = `%${query.search}%`;
      const c = or(
        ilike(reportsItems.code, p),
        ilike(reportsItems.name, p),
        ilike(reportsItems.description, p),
      );
      if (c) conditions.push(c);
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const sortCol =
      query.sortBy === "code"
        ? reportsItems.code
        : query.sortBy === "name"
          ? reportsItems.name
          : query.sortBy === "id"
            ? reportsItems.id
            : query.sortBy === "createdAt"
              ? reportsItems.createdAt
              : reportsItems.sortOrder;

    const [[totalRow], rows] = await Promise.all([
      this.db.select({ value: count() }).from(reportsItems).where(where),
      this.db
        .select()
        .from(reportsItems)
        .where(where)
        .orderBy(sortDirFn(sortCol), asc(reportsItems.id))
        .limit(query.pageSize)
        .offset(offset),
    ]);

    return this.wrapPage(rows, new Map(), Number(totalRow?.value ?? 0), query);
  }

  async create(entity: OrgEntityType, rawBody: unknown): Promise<OrgRecord> {
    try {
      return await this.db.transaction(async (tx) => {
        if (entity === "offices") {
          const dto = parseOrThrow(createOfficeSchema, rawBody);
          if (dto.parentId) {
            await this.ensureExists(tx, offices, dto.parentId, "Parent office");
          }
          if (dto.headEmployeeId) {
            await this.ensureEmployeeExists(tx, dto.headEmployeeId);
          }
          const [created] = await tx.insert(offices).values(dto).returning();
          if (!created) throw new Error("Failed to create office");
          return this.toRecord(created, { usageCount: 0, isInUse: false, usageReason: null });
        }

        if (entity === "departments") {
          const dto = parseOrThrow(createDepartmentSchema, rawBody);
          if (dto.officeId) {
            await this.ensureExists(tx, offices, dto.officeId, "Office");
          }
          if (dto.headEmployeeId) {
            await this.ensureEmployeeExists(tx, dto.headEmployeeId);
          }
          const [created] = await tx.insert(departments).values(dto).returning();
          if (!created) throw new Error("Failed to create department");
          return this.toRecord(created, { usageCount: 0, isInUse: false, usageReason: null });
        }

        if (entity === "divisions") {
          const dto = parseOrThrow(createDivisionSchema, rawBody);
          if (dto.departmentId) {
            await this.ensureExists(tx, departments, dto.departmentId, "Department");
          }
          if (dto.headEmployeeId) {
            await this.ensureEmployeeExists(tx, dto.headEmployeeId);
          }
          const [created] = await tx.insert(divisions).values(dto).returning();
          if (!created) throw new Error("Failed to create division");
          return this.toRecord(created, { usageCount: 0, isInUse: false, usageReason: null });
        }

        if (entity === "sections") {
          const dto = parseOrThrow(createSectionSchema, rawBody);
          const resolvedDeptId = await this.resolveSectionDepartment(
            tx,
            dto.divisionId ?? null,
            dto.departmentId ?? null,
          );
          if (dto.headEmployeeId) {
            await this.ensureEmployeeExists(tx, dto.headEmployeeId);
          }
          const [created] = await tx
            .insert(sections)
            .values({ ...dto, departmentId: resolvedDeptId })
            .returning();
          if (!created) throw new Error("Failed to create section");
          return this.toRecord(created, { usageCount: 0, isInUse: false, usageReason: null });
        }

        if (entity === "positions") {
          const dto = parseOrThrow(createPositionSchema, rawBody);
          if (dto.departmentId) {
            await this.ensureExists(tx, departments, dto.departmentId, "Department");
          }
          if (dto.divisionId) {
            await this.ensureExists(tx, divisions, dto.divisionId, "Division");
          }
          if (dto.sectionId) {
            await this.ensureExists(tx, sections, dto.sectionId, "Section");
          }
          if (dto.reportsToPositionId) {
            await this.ensureExists(tx, positions, dto.reportsToPositionId, "Superior position");
          }
          const [created] = await tx.insert(positions).values(dto).returning();
          if (!created) throw new Error("Failed to create position");
          return this.toRecord(created, { usageCount: 0, isInUse: false, usageReason: null });
        }

        const dto = parseOrThrow(createReportsItemSchema, rawBody);
        if (dto.reportsToEmployeeId) {
          await this.ensureEmployeeExists(tx, dto.reportsToEmployeeId);
        }
        const [created] = await tx.insert(reportsItems).values(dto).returning();
        if (!created) throw new Error("Failed to create reports item");
        return this.toRecord(created, { usageCount: 0, isInUse: false, usageReason: null });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("An organizational record with this code already exists");
      }
      throw error;
    }
  }

  async update(entity: OrgEntityType, id: number, rawBody: unknown): Promise<OrgRecord> {
    try {
      return await this.db.transaction(async (tx) => {
        if (entity === "offices") {
          const dto = parseOrThrow(updateOfficeSchema, rawBody);
          const [current] = await tx
            .select()
            .from(offices)
            .where(eq(offices.id, id))
            .for("update")
            .limit(1);
          if (!current) throw new NotFoundException(`Office #${id} not found`);

          if (dto.parentId !== undefined && dto.parentId !== null) {
            await this.ensureNoOfficeCycle(tx, id, dto.parentId);
          }
          if (dto.headEmployeeId) {
            await this.ensureEmployeeExists(tx, dto.headEmployeeId);
          }
          const [updated] = await tx
            .update(offices)
            .set({ ...dto, updatedAt: new Date() })
            .where(eq(offices.id, id))
            .returning();
          if (!updated) throw new NotFoundException(`Office #${id} not found`);
          const usage = (await this.computeUsageMap("offices", [updated], tx)).get(id) ?? {
            usageCount: 0,
            isInUse: false,
            usageReason: null,
          };
          return this.toRecord(updated, usage);
        }

        if (entity === "departments") {
          const dto = parseOrThrow(updateDepartmentSchema, rawBody);
          const [current] = await tx
            .select()
            .from(departments)
            .where(eq(departments.id, id))
            .for("update")
            .limit(1);
          if (!current) throw new NotFoundException(`Department #${id} not found`);
          if (dto.officeId) await this.ensureExists(tx, offices, dto.officeId, "Office");
          if (dto.headEmployeeId) await this.ensureEmployeeExists(tx, dto.headEmployeeId);

          const [updated] = await tx
            .update(departments)
            .set({ ...dto, updatedAt: new Date() })
            .where(eq(departments.id, id))
            .returning();
          if (!updated) throw new NotFoundException(`Department #${id} not found`);
          const usage = (await this.computeUsageMap("departments", [updated], tx)).get(id) ?? {
            usageCount: 0,
            isInUse: false,
            usageReason: null,
          };
          return this.toRecord(updated, usage);
        }

        if (entity === "divisions") {
          const dto = parseOrThrow(updateDivisionSchema, rawBody);
          const [current] = await tx
            .select()
            .from(divisions)
            .where(eq(divisions.id, id))
            .for("update")
            .limit(1);
          if (!current) throw new NotFoundException(`Division #${id} not found`);
          if (dto.departmentId) {
            await this.ensureExists(tx, departments, dto.departmentId, "Department");
          }
          if (dto.headEmployeeId) await this.ensureEmployeeExists(tx, dto.headEmployeeId);

          const [updated] = await tx
            .update(divisions)
            .set({ ...dto, updatedAt: new Date() })
            .where(eq(divisions.id, id))
            .returning();
          if (!updated) throw new NotFoundException(`Division #${id} not found`);
          const usage = (await this.computeUsageMap("divisions", [updated], tx)).get(id) ?? {
            usageCount: 0,
            isInUse: false,
            usageReason: null,
          };
          return this.toRecord(updated, usage);
        }

        if (entity === "sections") {
          const dto = parseOrThrow(updateSectionSchema, rawBody);
          const [current] = await tx
            .select()
            .from(sections)
            .where(eq(sections.id, id))
            .for("update")
            .limit(1);
          if (!current) throw new NotFoundException(`Section #${id} not found`);

          const nextDivisionId = dto.divisionId !== undefined ? dto.divisionId : current.divisionId;
          const nextDepartmentId =
            dto.departmentId !== undefined ? dto.departmentId : current.departmentId;
          const resolvedDeptId = await this.resolveSectionDepartment(
            tx,
            nextDivisionId ?? null,
            nextDepartmentId ?? null,
          );
          if (dto.headEmployeeId) await this.ensureEmployeeExists(tx, dto.headEmployeeId);

          const [updated] = await tx
            .update(sections)
            .set({ ...dto, departmentId: resolvedDeptId, updatedAt: new Date() })
            .where(eq(sections.id, id))
            .returning();
          if (!updated) throw new NotFoundException(`Section #${id} not found`);
          const usage = (await this.computeUsageMap("sections", [updated], tx)).get(id) ?? {
            usageCount: 0,
            isInUse: false,
            usageReason: null,
          };
          return this.toRecord(updated, usage);
        }

        if (entity === "positions") {
          const dto = parseOrThrow(updatePositionSchema, rawBody);
          const [current] = await tx
            .select()
            .from(positions)
            .where(eq(positions.id, id))
            .for("update")
            .limit(1);
          if (!current) throw new NotFoundException(`Position #${id} not found`);

          if (dto.reportsToPositionId !== undefined && dto.reportsToPositionId !== null) {
            await this.ensureNoPositionCycle(tx, id, dto.reportsToPositionId);
          }

          const [updated] = await tx
            .update(positions)
            .set({ ...dto, updatedAt: new Date() })
            .where(eq(positions.id, id))
            .returning();
          if (!updated) throw new NotFoundException(`Position #${id} not found`);
          const usage = (await this.computeUsageMap("positions", [updated], tx)).get(id) ?? {
            usageCount: 0,
            isInUse: false,
            usageReason: null,
          };
          return this.toRecord(updated, usage);
        }

        const dto = parseOrThrow(updateReportsItemSchema, rawBody);
        const [current] = await tx
          .select()
          .from(reportsItems)
          .where(eq(reportsItems.id, id))
          .for("update")
          .limit(1);
        if (!current) throw new NotFoundException(`Reports item #${id} not found`);

        const nextPosId = dto.positionId !== undefined ? dto.positionId : current.positionId;
        const nextReportsToPosId =
          dto.reportsToPositionId !== undefined
            ? dto.reportsToPositionId
            : current.reportsToPositionId;
        if (nextPosId && nextReportsToPosId && nextPosId === nextReportsToPosId) {
          throw new BadRequestException("Position cannot report to itself");
        }
        if (dto.reportsToEmployeeId) {
          await this.ensureEmployeeExists(tx, dto.reportsToEmployeeId);
        }

        const [updated] = await tx
          .update(reportsItems)
          .set({ ...dto, updatedAt: new Date() })
          .where(eq(reportsItems.id, id))
          .returning();
        if (!updated) throw new NotFoundException(`Reports item #${id} not found`);
        return this.toRecord(updated, { usageCount: 0, isInUse: false, usageReason: null });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("An organizational record with this code already exists");
      }
      throw error;
    }
  }

  async remove(entity: OrgEntityType, id: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      if (entity === "reports_items") {
        const [deleted] = await tx
          .delete(reportsItems)
          .where(eq(reportsItems.id, id))
          .returning({ id: reportsItems.id });
        if (!deleted) throw new NotFoundException(`Reports item #${id} not found`);
        return;
      }

      const table =
        entity === "offices"
          ? offices
          : entity === "departments"
            ? departments
            : entity === "divisions"
              ? divisions
              : entity === "sections"
                ? sections
                : positions;

      const [row] = await tx.select().from(table).where(eq(table.id, id)).for("update").limit(1);
      if (!row) {
        throw new NotFoundException(`Record #${id} not found`);
      }

      const usage = (await this.computeUsageMap(entity, [row], tx)).get(id);
      if (usage?.isInUse) {
        throw new BadRequestException(
          usage.usageReason ?? "Record is currently in use and cannot be deleted",
        );
      }

      await tx.delete(table).where(eq(table.id, id));
    });
  }

  private async ensureExists(
    tx: Pick<Database, "select">,
    table:
      | typeof offices
      | typeof departments
      | typeof divisions
      | typeof sections
      | typeof positions,
    id: number,
    label: string,
  ): Promise<void> {
    const [row] = await tx.select({ id: table.id }).from(table).where(eq(table.id, id)).limit(1);
    if (!row) {
      throw new BadRequestException(`${label} #${id} does not exist`);
    }
  }

  private async ensureEmployeeExists(
    tx: Pick<Database, "select">,
    employeeId: string,
  ): Promise<void> {
    const [emp] = await tx
      .select({ employeeId: employees.employeeId })
      .from(employees)
      .where(eq(employees.employeeId, employeeId))
      .limit(1);
    if (!emp) {
      throw new BadRequestException(`Employee ${employeeId} does not exist`);
    }
  }

  private async resolveSectionDepartment(
    tx: Pick<Database, "select">,
    divisionId: number | null,
    departmentId: number | null,
  ): Promise<number | null> {
    if (!divisionId) {
      if (departmentId) {
        await this.ensureExists(tx, departments, departmentId, "Department");
      }
      return departmentId;
    }

    const [div] = await tx
      .select({ id: divisions.id, departmentId: divisions.departmentId })
      .from(divisions)
      .where(eq(divisions.id, divisionId))
      .limit(1);
    if (!div) {
      throw new BadRequestException(`Division #${divisionId} does not exist`);
    }

    if (div.departmentId) {
      if (departmentId && departmentId !== div.departmentId) {
        throw new BadRequestException(
          "Selected department does not match the chosen division's parent department",
        );
      }
      return div.departmentId;
    }

    if (departmentId) {
      await this.ensureExists(tx, departments, departmentId, "Department");
    }
    return departmentId;
  }

  private async ensureNoOfficeCycle(
    tx: Pick<Database, "select">,
    officeId: number,
    targetParentId: number,
  ): Promise<void> {
    if (officeId === targetParentId) {
      throw new BadRequestException("An office cannot be its own parent");
    }
    await this.ensureExists(tx, offices, targetParentId, "Parent office");

    const visited = new Set<number>([officeId]);
    let cursor: number | null = targetParentId;
    while (cursor !== null) {
      if (visited.has(cursor)) {
        throw new BadRequestException("Circular parent office hierarchy is not allowed");
      }
      visited.add(cursor);
      const [row] = await tx
        .select({ parentId: offices.parentId })
        .from(offices)
        .where(eq(offices.id, cursor))
        .limit(1);
      cursor = row?.parentId ?? null;
    }
  }

  private async ensureNoPositionCycle(
    tx: Pick<Database, "select">,
    positionId: number,
    targetReportsToId: number,
  ): Promise<void> {
    if (positionId === targetReportsToId) {
      throw new BadRequestException("A position cannot report to itself");
    }
    await this.ensureExists(tx, positions, targetReportsToId, "Superior position");

    const visited = new Set<number>([positionId]);
    let cursor: number | null = targetReportsToId;
    while (cursor !== null) {
      if (visited.has(cursor)) {
        throw new BadRequestException("Circular position reporting hierarchy is not allowed");
      }
      visited.add(cursor);
      const [row] = await tx
        .select({ reportsToPositionId: positions.reportsToPositionId })
        .from(positions)
        .where(eq(positions.id, cursor))
        .limit(1);
      cursor = row?.reportsToPositionId ?? null;
    }
  }

  private async computeUsageMap(
    entity: Exclude<OrgEntityType, "reports_items">,
    rows: Array<{ id: number; code: string; name?: string; title?: string }>,
    executor: Pick<Database, "select"> = this.db,
  ): Promise<Map<number, UsageMetadata>> {
    const result = new Map<number, UsageMetadata>();
    if (rows.length === 0) {
      return result;
    }

    const ids = rows.map((r) => r.id);
    const groupCount = async (
      table:
        | typeof offices
        | typeof departments
        | typeof divisions
        | typeof sections
        | typeof positions
        | typeof reportsItems,
      fkCol: AnyPgColumn,
    ): Promise<Map<number, number>> => {
      const grouped = await executor
        .select({ key: fkCol, total: count() })
        .from(table)
        .where(inArray(fkCol, ids))
        .groupBy(fkCol);
      const map = new Map<number, number>();
      for (const g of grouped) {
        if (g.key !== null && g.key !== undefined) {
          map.set(Number(g.key), Number(g.total));
        }
      }
      return map;
    };

    const empCol =
      entity === "offices"
        ? employees.office
        : entity === "departments"
          ? employees.department
          : entity === "divisions"
            ? employees.division
            : entity === "sections"
              ? employees.section
              : employees.position;

    const empGrouped = await executor
      .select({ val: sql<string>`lower(${empCol})`, total: count() })
      .from(employees)
      .where(sql`${empCol} is not null`)
      .groupBy(sql`lower(${empCol})`);
    const empByLower = new Map<string, number>();
    for (const g of empGrouped) {
      if (g.val) empByLower.set(g.val, Number(g.total));
    }

    const getEmpCount = (row: { code: string; name?: string; title?: string }) => {
      const keys = new Set<string>([row.code.toLowerCase()]);
      const label = (row.name ?? row.title ?? "").trim().toLowerCase();
      if (label) keys.add(label);
      let total = 0;
      for (const k of keys) {
        total += empByLower.get(k) ?? 0;
      }
      return total;
    };

    if (entity === "offices") {
      const [childOffices, childDepts, repItems] = await Promise.all([
        groupCount(offices, offices.parentId),
        groupCount(departments, departments.officeId),
        groupCount(reportsItems, reportsItems.officeId),
      ]);
      for (const row of rows) {
        result.set(
          row.id,
          formatUsageReason([
            { count: childOffices.get(row.id) ?? 0, label: "child office" },
            { count: childDepts.get(row.id) ?? 0, label: "department" },
            { count: repItems.get(row.id) ?? 0, label: "reports item" },
            { count: getEmpCount(row), label: "employee" },
          ]),
        );
      }
      return result;
    }

    if (entity === "departments") {
      const [childDivs, childSecs, childPos, repItems] = await Promise.all([
        groupCount(divisions, divisions.departmentId),
        groupCount(sections, sections.departmentId),
        groupCount(positions, positions.departmentId),
        groupCount(reportsItems, reportsItems.departmentId),
      ]);
      for (const row of rows) {
        result.set(
          row.id,
          formatUsageReason([
            { count: childDivs.get(row.id) ?? 0, label: "division" },
            { count: childSecs.get(row.id) ?? 0, label: "section" },
            { count: childPos.get(row.id) ?? 0, label: "position" },
            { count: repItems.get(row.id) ?? 0, label: "reports item" },
            { count: getEmpCount(row), label: "employee" },
          ]),
        );
      }
      return result;
    }

    if (entity === "divisions") {
      const [childSecs, childPos, repItems] = await Promise.all([
        groupCount(sections, sections.divisionId),
        groupCount(positions, positions.divisionId),
        groupCount(reportsItems, reportsItems.divisionId),
      ]);
      for (const row of rows) {
        result.set(
          row.id,
          formatUsageReason([
            { count: childSecs.get(row.id) ?? 0, label: "section" },
            { count: childPos.get(row.id) ?? 0, label: "position" },
            { count: repItems.get(row.id) ?? 0, label: "reports item" },
            { count: getEmpCount(row), label: "employee" },
          ]),
        );
      }
      return result;
    }

    if (entity === "sections") {
      const [childPos, repItems] = await Promise.all([
        groupCount(positions, positions.sectionId),
        groupCount(reportsItems, reportsItems.sectionId),
      ]);
      for (const row of rows) {
        result.set(
          row.id,
          formatUsageReason([
            { count: childPos.get(row.id) ?? 0, label: "position" },
            { count: repItems.get(row.id) ?? 0, label: "reports item" },
            { count: getEmpCount(row), label: "employee" },
          ]),
        );
      }
      return result;
    }

    // positions
    const [subPositions, repSubject, repSuperior] = await Promise.all([
      groupCount(positions, positions.reportsToPositionId),
      groupCount(reportsItems, reportsItems.positionId),
      groupCount(reportsItems, reportsItems.reportsToPositionId),
    ]);
    for (const row of rows) {
      result.set(
        row.id,
        formatUsageReason([
          { count: subPositions.get(row.id) ?? 0, label: "subordinate position" },
          {
            count: (repSubject.get(row.id) ?? 0) + (repSuperior.get(row.id) ?? 0),
            label: "reports item",
          },
          { count: getEmpCount(row), label: "employee" },
        ]),
      );
    }
    return result;
  }

  private toRecord(
    row: { id: number; createdAt: Date; updatedAt: Date } & Record<string, unknown>,
    usage: UsageMetadata,
  ): OrgRecord {
    return {
      ...(row as unknown as OrgRecord),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      ...usage,
    };
  }

  private wrapPage(
    rows: Array<{ id: number; createdAt: Date; updatedAt: Date } & Record<string, unknown>>,
    usageMap: Map<number, UsageMetadata>,
    total: number,
    query: ListOrgQuery,
  ): PaginatedResponse<OrgRecord> {
    return {
      data: rows.map((row) =>
        this.toRecord(
          row,
          usageMap.get(row.id) ?? { usageCount: 0, isInUse: false, usageReason: null },
        ),
      ),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }
}
