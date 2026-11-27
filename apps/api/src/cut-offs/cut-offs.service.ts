import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { cutOffPeriods, cutOffs, type Database } from "@starter/db";
import {
  type CreateCutOffDto,
  type CutOffPeriodRecord,
  type CutOffPresetItem,
  type CutOffPresetsQuery,
  type CutOffRecord,
  type CutOffScheduleType,
  type ListCutOffsQuery,
  normalizeCutOffPeriod,
  type PaginatedResponse,
  type UpdateCutOffDto,
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
  notInArray,
  type SQL,
} from "drizzle-orm";
import { DB } from "../database/database.module.js";

@Injectable()
export class CutOffsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(query: ListCutOffsQuery): Promise<PaginatedResponse<CutOffRecord>> {
    const offset = (query.page - 1) * query.pageSize;
    const conditions: SQL[] = [];

    if (query.search) {
      conditions.push(ilike(cutOffs.name, `%${query.search}%`));
    }
    if (query.scheduleType !== "all") {
      conditions.push(eq(cutOffs.scheduleType, query.scheduleType));
    }
    if (query.month !== undefined) {
      conditions.push(eq(cutOffs.month, query.month));
    }
    if (query.year !== undefined) {
      conditions.push(eq(cutOffs.year, query.year));
    }
    if (query.isActive !== "all") {
      conditions.push(eq(cutOffs.isActive, query.isActive === "true"));
    }
    if (query.createdFrom) {
      conditions.push(gte(cutOffs.createdAt, new Date(`${query.createdFrom}T00:00:00Z`)));
    }
    if (query.createdTo) {
      conditions.push(lte(cutOffs.createdAt, new Date(`${query.createdTo}T23:59:59.999Z`)));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const sortDirFn = query.sortDir === "asc" ? asc : desc;
    const sortCol =
      query.sortBy === "name"
        ? cutOffs.name
        : query.sortBy === "year"
          ? cutOffs.year
          : query.sortBy === "month"
            ? cutOffs.month
            : query.sortBy === "scheduleType"
              ? cutOffs.scheduleType
              : query.sortBy === "isActive"
                ? cutOffs.isActive
                : cutOffs.createdAt;

    const [[totalRow], rows] = await Promise.all([
      this.db.select({ value: count() }).from(cutOffs).where(where),
      this.db
        .select()
        .from(cutOffs)
        .where(where)
        .orderBy(sortDirFn(sortCol), desc(cutOffs.id))
        .limit(query.pageSize)
        .offset(offset),
    ]);

    const data = await this.hydrateCutOffs(rows);
    const total = Number(totalRow?.value ?? 0);

    return {
      data,
      meta: {
        total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async getActivePresets(query: CutOffPresetsQuery): Promise<CutOffPresetItem[]> {
    const conditions: SQL[] = [eq(cutOffs.isActive, true)];
    if (query.scheduleType) {
      conditions.push(eq(cutOffs.scheduleType, query.scheduleType));
    }

    const headers = await this.db
      .select()
      .from(cutOffs)
      .where(and(...conditions))
      .orderBy(desc(cutOffs.year), desc(cutOffs.month), desc(cutOffs.id));

    if (headers.length === 0) {
      return [];
    }

    const headerMap = new Map(headers.map((h) => [h.id, h]));
    const periods = await this.db
      .select()
      .from(cutOffPeriods)
      .where(
        inArray(
          cutOffPeriods.cutOffId,
          headers.map((h) => h.id),
        ),
      )
      .orderBy(asc(cutOffPeriods.cutOffNo));

    const result: CutOffPresetItem[] = [];
    for (const header of headers) {
      const childPeriods = periods.filter((p) => p.cutOffId === header.id);
      for (const p of childPeriods) {
        const parent = headerMap.get(p.cutOffId);
        if (!parent) continue;
        result.push({
          cutOffId: parent.id,
          cutOffName: parent.name,
          scheduleType: parent.scheduleType as CutOffScheduleType,
          year: parent.year,
          month: parent.month,
          periodId: p.id,
          cutOffNo: p.cutOffNo,
          noDtr: p.noDtr,
          presetDateFrom: p.noDtr ? p.payrollDateFrom : (p.dtrDateFrom ?? p.payrollDateFrom),
          presetDateTo: p.noDtr ? p.payrollDateTo : (p.dtrDateTo ?? p.payrollDateTo),
          payrollDateFrom: p.payrollDateFrom,
          payrollDateTo: p.payrollDateTo,
          releaseDate: p.releaseDate,
        });
      }
    }

    return result;
  }

  async getById(id: number): Promise<CutOffRecord> {
    const [row] = await this.db.select().from(cutOffs).where(eq(cutOffs.id, id)).limit(1);
    if (!row) {
      throw new NotFoundException(`Cut-off #${id} not found`);
    }
    const [hydrated] = await this.hydrateCutOffs([row]);
    if (!hydrated) {
      throw new NotFoundException(`Cut-off #${id} not found`);
    }
    return hydrated;
  }

  async create(dto: CreateCutOffDto): Promise<CutOffRecord> {
    const createdId = await this.db.transaction(async (tx) => {
      const [header] = await tx
        .insert(cutOffs)
        .values({
          scheduleType: dto.scheduleType,
          name: dto.name,
          year: dto.year,
          month: dto.month,
          isActive: dto.isActive,
        })
        .returning();

      if (!header) {
        throw new Error("Failed to create cut-off");
      }

      const normalized = dto.periods.map(normalizeCutOffPeriod);
      await tx.insert(cutOffPeriods).values(
        normalized.map((p) => ({
          cutOffId: header.id,
          cutOffNo: p.cutOffNo,
          noDtr: p.noDtr,
          dtrDateFrom: p.dtrDateFrom ?? null,
          dtrDateTo: p.dtrDateTo ?? null,
          confirmationStartDate: p.confirmationStartDate ?? null,
          confirmationEndDate: p.confirmationEndDate ?? null,
          confirmationTimeFrom: p.confirmationTimeFrom ?? null,
          confirmationTimeTo: p.confirmationTimeTo ?? null,
          payrollDateFrom: p.payrollDateFrom,
          payrollDateTo: p.payrollDateTo,
          releaseDate: p.releaseDate,
        })),
      );

      return header.id;
    });

    return this.getById(createdId);
  }

  async update(id: number, dto: UpdateCutOffDto): Promise<CutOffRecord> {
    await this.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(cutOffs).where(eq(cutOffs.id, id)).for("update");

      if (!existing) {
        throw new NotFoundException(`Cut-off #${id} not found`);
      }

      const now = new Date();
      await tx
        .update(cutOffs)
        .set({
          scheduleType: dto.scheduleType,
          name: dto.name,
          year: dto.year,
          month: dto.month,
          isActive: dto.isActive,
          updatedAt: now,
        })
        .where(eq(cutOffs.id, id));

      const normalized = dto.periods.map(normalizeCutOffPeriod);
      const keepNumbers = normalized.map((p) => p.cutOffNo);

      // Remove obsolete period rows (e.g. 2nd cut-off when switching semi_monthly -> monthly)
      await tx
        .delete(cutOffPeriods)
        .where(
          and(eq(cutOffPeriods.cutOffId, id), notInArray(cutOffPeriods.cutOffNo, keepNumbers)),
        );

      // Upsert remaining periods by (cut_off_id, cut_off_no) to keep period IDs stable
      for (const p of normalized) {
        await tx
          .insert(cutOffPeriods)
          .values({
            cutOffId: id,
            cutOffNo: p.cutOffNo,
            noDtr: p.noDtr,
            dtrDateFrom: p.dtrDateFrom ?? null,
            dtrDateTo: p.dtrDateTo ?? null,
            confirmationStartDate: p.confirmationStartDate ?? null,
            confirmationEndDate: p.confirmationEndDate ?? null,
            confirmationTimeFrom: p.confirmationTimeFrom ?? null,
            confirmationTimeTo: p.confirmationTimeTo ?? null,
            payrollDateFrom: p.payrollDateFrom,
            payrollDateTo: p.payrollDateTo,
            releaseDate: p.releaseDate,
          })
          .onConflictDoUpdate({
            target: [cutOffPeriods.cutOffId, cutOffPeriods.cutOffNo],
            set: {
              noDtr: p.noDtr,
              dtrDateFrom: p.dtrDateFrom ?? null,
              dtrDateTo: p.dtrDateTo ?? null,
              confirmationStartDate: p.confirmationStartDate ?? null,
              confirmationEndDate: p.confirmationEndDate ?? null,
              confirmationTimeFrom: p.confirmationTimeFrom ?? null,
              confirmationTimeTo: p.confirmationTimeTo ?? null,
              payrollDateFrom: p.payrollDateFrom,
              payrollDateTo: p.payrollDateTo,
              releaseDate: p.releaseDate,
              updatedAt: now,
            },
          });
      }
    });

    return this.getById(id);
  }

  async remove(id: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: cutOffs.id })
        .from(cutOffs)
        .where(eq(cutOffs.id, id))
        .for("update");

      if (!existing) {
        throw new NotFoundException(`Cut-off #${id} not found`);
      }

      await tx.delete(cutOffs).where(eq(cutOffs.id, id));
    });
  }

  private async hydrateCutOffs(
    headers: Array<typeof cutOffs.$inferSelect>,
  ): Promise<CutOffRecord[]> {
    if (headers.length === 0) {
      return [];
    }

    const ids = headers.map((h) => h.id);
    const periodRows = await this.db
      .select()
      .from(cutOffPeriods)
      .where(inArray(cutOffPeriods.cutOffId, ids))
      .orderBy(asc(cutOffPeriods.cutOffNo));

    const periodsByParent = new Map<number, CutOffPeriodRecord[]>();
    for (const p of periodRows) {
      const list = periodsByParent.get(p.cutOffId) ?? [];
      list.push({
        id: p.id,
        cutOffId: p.cutOffId,
        cutOffNo: p.cutOffNo,
        dtrDateFrom: p.dtrDateFrom,
        dtrDateTo: p.dtrDateTo,
        noDtr: p.noDtr,
        confirmationStartDate: p.confirmationStartDate,
        confirmationEndDate: p.confirmationEndDate,
        confirmationTimeFrom: p.confirmationTimeFrom,
        confirmationTimeTo: p.confirmationTimeTo,
        payrollDateFrom: p.payrollDateFrom,
        payrollDateTo: p.payrollDateTo,
        releaseDate: p.releaseDate,
      });
      periodsByParent.set(p.cutOffId, list);
    }

    return headers.map((h) => ({
      id: h.id,
      scheduleType: h.scheduleType as CutOffScheduleType,
      name: h.name,
      year: h.year,
      month: h.month,
      isActive: h.isActive,
      periods: periodsByParent.get(h.id) ?? [],
      createdAt: h.createdAt.toISOString(),
      updatedAt: h.updatedAt.toISOString(),
    }));
  }
}
