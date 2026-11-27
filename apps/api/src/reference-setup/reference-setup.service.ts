import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { type Database, employees, setupReferenceItems } from "@starter/db";
import {
  type CreateReferenceItemDto,
  getReferenceCategoriesByGroup,
  getReferenceCategoryDef,
  type ListReferenceItemsQuery,
  type PaginatedResponse,
  REFERENCE_PARENT_CATEGORY_MAP,
  type ReferenceActiveOptionsMap,
  type ReferenceCategorySummary,
  type ReferenceGroupKey,
  type ReferenceItemRecord,
  type ReferenceOptionsQuery,
  type UpdateReferenceItemDto,
} from "@starter/shared";
import { and, asc, count, desc, eq, ilike, inArray, ne, or, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { DB } from "../database/database.module.js";

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const pgError = error as { code?: string; cause?: { code?: string } };
  return pgError.code === "23505" || pgError.cause?.code === "23505";
}

const EMPLOYEE_SCALAR_COLUMNS: Record<string, AnyPgColumn> = {
  gender: employees.gender,
  civilStatus: employees.civilStatus,
  bloodType: employees.bloodType,
  country: employees.country,
  nationality: employees.nationality,
  citizenship: employees.citizenship,
  religion: employees.religion,
  educationalAttainment: employees.educationalAttainment,
  degreeCourse: employees.degreeCourse,
  emergencyContactRelationship: employees.emergencyContactRelationship,
  disabilityType: employees.disabilityType,
  type: employees.type,
  employmentStatus: employees.employmentStatus,
  employeeCategory: employees.employeeCategory,
  appointmentType: employees.appointmentType,
  employmentClassification: employees.employmentClassification,
  workArrangement: employees.workArrangement,
  separationType: employees.separationType,
  separationReason: employees.separationReason,
};

@Injectable()
export class ReferenceSetupService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async getCategories(group: ReferenceGroupKey): Promise<ReferenceCategorySummary[]> {
    const defs = getReferenceCategoriesByGroup(group);
    const counts = await this.db
      .select({
        category: setupReferenceItems.category,
        total: count(),
        active: sql<number>`count(*) filter (where ${setupReferenceItems.isActive} = true)`,
      })
      .from(setupReferenceItems)
      .where(eq(setupReferenceItems.group, group))
      .groupBy(setupReferenceItems.category);

    const map = new Map(
      counts.map((c) => [c.category, { total: Number(c.total), active: Number(c.active) }]),
    );

    return defs.map((def) => ({
      ...def,
      totalCount: map.get(def.category)?.total ?? 0,
      activeCount: map.get(def.category)?.active ?? 0,
    }));
  }

  async getActiveOptions(query: ReferenceOptionsQuery): Promise<ReferenceActiveOptionsMap> {
    const requested = query.categories
      ? query.categories
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)
      : [];

    const conditions: SQL[] = [eq(setupReferenceItems.isActive, true)];
    if (requested.length > 0) {
      conditions.push(inArray(setupReferenceItems.category, requested));
    }

    const rows = await this.db
      .select({
        id: setupReferenceItems.id,
        category: setupReferenceItems.category,
        code: setupReferenceItems.code,
        name: setupReferenceItems.name,
        parentId: setupReferenceItems.parentId,
        isDefault: setupReferenceItems.isDefault,
      })
      .from(setupReferenceItems)
      .where(and(...conditions))
      .orderBy(asc(setupReferenceItems.sortOrder), asc(setupReferenceItems.id));

    const grouped: ReferenceActiveOptionsMap = {};
    for (const cat of requested) {
      grouped[cat] = [];
    }
    for (const row of rows) {
      const list = grouped[row.category] ?? [];
      list.push({
        id: row.id,
        code: row.code,
        name: row.name,
        parentId: row.parentId,
        isDefault: row.isDefault,
      });
      grouped[row.category] = list;
    }
    return grouped;
  }

  async listItems(
    group: ReferenceGroupKey,
    query: ListReferenceItemsQuery,
  ): Promise<PaginatedResponse<ReferenceItemRecord>> {
    this.assertCategoryOwnership(group, query.category);

    const conditions: SQL[] = [
      eq(setupReferenceItems.group, group),
      eq(setupReferenceItems.category, query.category),
    ];

    if (query.status === "active") {
      conditions.push(eq(setupReferenceItems.isActive, true));
    } else if (query.status === "inactive") {
      conditions.push(eq(setupReferenceItems.isActive, false));
    }

    if (query.parentId) {
      conditions.push(eq(setupReferenceItems.parentId, query.parentId));
    }

    if (query.search) {
      const p = `%${query.search}%`;
      const searchCond = or(
        ilike(setupReferenceItems.code, p),
        ilike(setupReferenceItems.name, p),
        ilike(setupReferenceItems.description, p),
      );
      if (searchCond) {
        conditions.push(searchCond);
      }
    }

    const where = and(...conditions);
    const sortDirFn = query.sortDir === "desc" ? desc : asc;
    const sortCol =
      query.sortBy === "code"
        ? setupReferenceItems.code
        : query.sortBy === "name"
          ? setupReferenceItems.name
          : query.sortBy === "id"
            ? setupReferenceItems.id
            : query.sortBy === "createdAt"
              ? setupReferenceItems.createdAt
              : setupReferenceItems.sortOrder;

    const offset = (query.page - 1) * query.pageSize;

    const [[totalRow], rows] = await Promise.all([
      this.db.select({ value: count() }).from(setupReferenceItems).where(where),
      this.db
        .select()
        .from(setupReferenceItems)
        .where(where)
        .orderBy(sortDirFn(sortCol), asc(setupReferenceItems.id))
        .limit(query.pageSize)
        .offset(offset),
    ]);

    const parentIds = [
      ...new Set(rows.map((r) => r.parentId).filter((id): id is number => id !== null)),
    ];
    const parentRows =
      parentIds.length > 0
        ? await this.db
            .select({
              id: setupReferenceItems.id,
              code: setupReferenceItems.code,
              name: setupReferenceItems.name,
            })
            .from(setupReferenceItems)
            .where(inArray(setupReferenceItems.id, parentIds))
        : [];
    const parentMap = new Map(parentRows.map((p) => [p.id, p]));

    const usageMap = await this.computeItemUsageMap(query.category, rows);

    const total = Number(totalRow?.value ?? 0);
    return {
      data: rows.map((row) => {
        const parent = row.parentId ? parentMap.get(row.parentId) : undefined;
        const usage = usageMap.get(row.id) ?? { usageCount: 0, isInUse: false, usageReason: null };
        return {
          id: row.id,
          group: row.group as ReferenceGroupKey,
          category: row.category,
          code: row.code,
          name: row.name,
          description: row.description,
          parentId: row.parentId,
          parentName: parent?.name ?? null,
          parentCode: parent?.code ?? null,
          metadata: row.metadata ?? null,
          sortOrder: row.sortOrder,
          isDefault: row.isDefault,
          isActive: row.isActive,
          ...usage,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        };
      }),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async create(
    group: ReferenceGroupKey,
    dto: CreateReferenceItemDto,
  ): Promise<ReferenceItemRecord> {
    this.assertCategoryOwnership(group, dto.category);

    try {
      return await this.db.transaction(async (tx) => {
        const parent = await this.validateParent(tx, dto.category, dto.parentId ?? null);

        if (dto.isDefault) {
          await tx
            .update(setupReferenceItems)
            .set({ isDefault: false, updatedAt: new Date() })
            .where(
              and(
                eq(setupReferenceItems.category, dto.category),
                eq(setupReferenceItems.isDefault, true),
              ),
            );
        }

        const [created] = await tx
          .insert(setupReferenceItems)
          .values({
            group,
            category: dto.category,
            code: dto.code,
            name: dto.name,
            description: dto.description ?? null,
            parentId: dto.parentId ?? null,
            metadata: dto.metadata ?? null,
            sortOrder: dto.sortOrder,
            isDefault: dto.isDefault,
            isActive: dto.isActive,
          })
          .returning();

        if (!created) {
          throw new Error("Failed to create reference item");
        }

        return {
          id: created.id,
          group: created.group as ReferenceGroupKey,
          category: created.category,
          code: created.code,
          name: created.name,
          description: created.description,
          parentId: created.parentId,
          parentName: parent?.name ?? null,
          parentCode: parent?.code ?? null,
          metadata: created.metadata ?? null,
          sortOrder: created.sortOrder,
          isDefault: created.isDefault,
          isActive: created.isActive,
          usageCount: 0,
          isInUse: false,
          usageReason: null,
          createdAt: created.createdAt.toISOString(),
          updatedAt: created.updatedAt.toISOString(),
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `Code "${dto.code}" already exists in category "${dto.category}"`,
        );
      }
      throw error;
    }
  }

  async update(
    group: ReferenceGroupKey,
    id: number,
    dto: UpdateReferenceItemDto,
  ): Promise<ReferenceItemRecord> {
    try {
      return await this.db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(setupReferenceItems)
          .where(and(eq(setupReferenceItems.id, id), eq(setupReferenceItems.group, group)))
          .for("update")
          .limit(1);

        if (!current) {
          throw new NotFoundException(`Reference item #${id} not found in group "${group}"`);
        }

        const nextIsActive = dto.isActive !== undefined ? dto.isActive : current.isActive;
        const nextIsDefault = dto.isDefault !== undefined ? dto.isDefault : current.isDefault;

        if (nextIsDefault && !nextIsActive) {
          throw new BadRequestException("An inactive item cannot be marked as default");
        }

        const nextParentId = dto.parentId !== undefined ? dto.parentId : current.parentId;
        if (nextParentId === id) {
          throw new BadRequestException("A reference item cannot be its own parent");
        }
        const parent = await this.validateParent(tx, current.category, nextParentId);

        if (nextIsDefault) {
          await tx
            .update(setupReferenceItems)
            .set({ isDefault: false, updatedAt: new Date() })
            .where(
              and(
                eq(setupReferenceItems.category, current.category),
                eq(setupReferenceItems.isDefault, true),
                ne(setupReferenceItems.id, id),
              ),
            );
        }

        const [updated] = await tx
          .update(setupReferenceItems)
          .set({
            ...dto,
            isActive: nextIsActive,
            isDefault: nextIsDefault,
            parentId: nextParentId,
            updatedAt: new Date(),
          })
          .where(eq(setupReferenceItems.id, id))
          .returning();

        if (!updated) {
          throw new NotFoundException(`Reference item #${id} not found`);
        }

        const usage = (await this.computeItemUsageMap(current.category, [updated], tx)).get(id) ?? {
          usageCount: 0,
          isInUse: false,
          usageReason: null,
        };

        return {
          id: updated.id,
          group: updated.group as ReferenceGroupKey,
          category: updated.category,
          code: updated.code,
          name: updated.name,
          description: updated.description,
          parentId: updated.parentId,
          parentName: parent?.name ?? null,
          parentCode: parent?.code ?? null,
          metadata: updated.metadata ?? null,
          sortOrder: updated.sortOrder,
          isDefault: updated.isDefault,
          isActive: updated.isActive,
          ...usage,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("Code already exists in this category");
      }
      throw error;
    }
  }

  async remove(group: ReferenceGroupKey, id: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(setupReferenceItems)
        .where(and(eq(setupReferenceItems.id, id), eq(setupReferenceItems.group, group)))
        .for("update")
        .limit(1);

      if (!current) {
        throw new NotFoundException(`Reference item #${id} not found in group "${group}"`);
      }

      const usage = (await this.computeItemUsageMap(current.category, [current], tx)).get(id);
      if (usage?.isInUse) {
        throw new BadRequestException(
          usage.usageReason ?? "Reference item is currently in use and cannot be deleted",
        );
      }

      await tx.delete(setupReferenceItems).where(eq(setupReferenceItems.id, id));
    });
  }

  private assertCategoryOwnership(group: ReferenceGroupKey, category: string): void {
    const def = getReferenceCategoryDef(category);
    if (!def) {
      throw new BadRequestException(`Unknown reference category "${category}"`);
    }
    if (def.group !== group) {
      throw new BadRequestException(
        `Category "${category}" belongs to group "${def.group}", not "${group}"`,
      );
    }
  }

  private async validateParent(
    tx: Pick<Database, "select">,
    category: string,
    parentId: number | null,
  ): Promise<{ id: number; code: string; name: string } | null> {
    const allowedParentCategory = REFERENCE_PARENT_CATEGORY_MAP[category];
    if (!parentId) {
      return null;
    }
    if (!allowedParentCategory) {
      throw new BadRequestException(`Category "${category}" does not support parent items`);
    }

    const [parent] = await tx
      .select({
        id: setupReferenceItems.id,
        category: setupReferenceItems.category,
        code: setupReferenceItems.code,
        name: setupReferenceItems.name,
      })
      .from(setupReferenceItems)
      .where(eq(setupReferenceItems.id, parentId))
      .limit(1);

    if (!parent) {
      throw new BadRequestException(`Parent item #${parentId} does not exist`);
    }
    if (parent.category !== allowedParentCategory) {
      throw new BadRequestException(
        `Parent item must belong to category "${allowedParentCategory}"`,
      );
    }
    return { id: parent.id, code: parent.code, name: parent.name };
  }

  private async computeItemUsageMap(
    category: string,
    rows: Array<{ id: number; code: string; name: string }>,
    executor: Pick<Database, "select"> = this.db,
  ): Promise<Map<number, { usageCount: number; isInUse: boolean; usageReason: string | null }>> {
    const map = new Map<
      number,
      { usageCount: number; isInUse: boolean; usageReason: string | null }
    >();
    if (rows.length === 0) {
      return map;
    }

    const ids = rows.map((r) => r.id);
    const childCountsRaw = await executor
      .select({ parentId: setupReferenceItems.parentId, total: count() })
      .from(setupReferenceItems)
      .where(inArray(setupReferenceItems.parentId, ids))
      .groupBy(setupReferenceItems.parentId);

    const childMap = new Map<number, number>();
    for (const c of childCountsRaw) {
      if (c.parentId !== null) {
        childMap.set(c.parentId, Number(c.total));
      }
    }

    const def = getReferenceCategoryDef(category);
    const empByLower = new Map<string, number>();

    if (def?.employeeField) {
      if (def.isArrayField) {
        const empLangRows = await executor
          .select({ languages: employees.languages })
          .from(employees)
          .where(sql`${employees.languages} is not null`);
        for (const r of empLangRows) {
          const seen = new Set<string>();
          for (const lang of r.languages ?? []) {
            const lower = lang.trim().toLowerCase();
            if (lower && !seen.has(lower)) {
              seen.add(lower);
              empByLower.set(lower, (empByLower.get(lower) ?? 0) + 1);
            }
          }
        }
      } else {
        const col = EMPLOYEE_SCALAR_COLUMNS[def.employeeField];
        if (col) {
          const grouped = await executor
            .select({ val: sql<string>`lower(${col})`, total: count() })
            .from(employees)
            .where(sql`${col} is not null`)
            .groupBy(sql`lower(${col})`);
          for (const g of grouped) {
            if (g.val) {
              empByLower.set(g.val, Number(g.total));
            }
          }
        }
      }
    }

    for (const row of rows) {
      const childCount = childMap.get(row.id) ?? 0;
      const keys = new Set<string>([row.code.toLowerCase(), row.name.trim().toLowerCase()]);
      let empCount = 0;
      for (const k of keys) {
        empCount += empByLower.get(k) ?? 0;
      }

      const usageCount = childCount + empCount;
      const parts: string[] = [];
      if (childCount > 0) {
        parts.push(`${childCount} child item${childCount === 1 ? "" : "s"}`);
      }
      if (empCount > 0) {
        parts.push(`${empCount} employee${empCount === 1 ? "" : "s"}`);
      }

      map.set(row.id, {
        usageCount,
        isInUse: usageCount > 0,
        usageReason:
          parts.length > 0
            ? `Referenced by ${parts.join(" and ")}. Deactivate instead of deleting.`
            : null,
      });
    }

    return map;
  }
}
