import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { attendancePolicies, type Database, schedules } from "@starter/db";
import type {
  AttendancePolicyOptionsResponse,
  AttendancePolicyRecord,
  CreateAttendancePolicyDto,
  ListAttendancePoliciesQuery,
  PaginatedResponse,
  TardyCountFrom,
  UpdateAttendancePolicyDto,
} from "@starter/shared";
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, ne, or, type SQL } from "drizzle-orm";
import { DB } from "../database/database.module.js";

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const pgError = error as { code?: string; cause?: { code?: string } };
  return pgError.code === "23505" || pgError.cause?.code === "23505";
}

@Injectable()
export class AttendancePoliciesService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(
    query: ListAttendancePoliciesQuery,
  ): Promise<PaginatedResponse<AttendancePolicyRecord>> {
    const offset = (query.page - 1) * query.pageSize;
    const conditions: SQL[] = [];

    if (query.search) {
      const pattern = `%${query.search}%`;
      const searchCond = or(
        ilike(attendancePolicies.name, pattern),
        ilike(attendancePolicies.description, pattern),
      );
      if (searchCond) {
        conditions.push(searchCond);
      }
    }
    if (query.tardyCountFrom !== "all") {
      conditions.push(eq(attendancePolicies.tardyCountFrom, query.tardyCountFrom));
    }
    if (query.isDefault !== "all") {
      conditions.push(eq(attendancePolicies.isDefault, query.isDefault === "true"));
    }
    if (query.isActive !== "all") {
      conditions.push(eq(attendancePolicies.isActive, query.isActive === "true"));
    }
    if (query.createdFrom) {
      conditions.push(
        gte(attendancePolicies.createdAt, new Date(`${query.createdFrom}T00:00:00Z`)),
      );
    }
    if (query.createdTo) {
      conditions.push(
        lte(attendancePolicies.createdAt, new Date(`${query.createdTo}T23:59:59.999Z`)),
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const sortDirFn = query.sortDir === "asc" ? asc : desc;
    const sortCol =
      query.sortBy === "name"
        ? attendancePolicies.name
        : query.sortBy === "tardyGraceSeconds"
          ? attendancePolicies.tardyGraceSeconds
          : query.sortBy === "undertimeGraceSeconds"
            ? attendancePolicies.undertimeGraceSeconds
            : query.sortBy === "absentAfterLateSeconds"
              ? attendancePolicies.absentAfterLateSeconds
              : query.sortBy === "isDefault"
                ? attendancePolicies.isDefault
                : query.sortBy === "isActive"
                  ? attendancePolicies.isActive
                  : attendancePolicies.createdAt;

    const [[totalRow], rows] = await Promise.all([
      this.db.select({ value: count() }).from(attendancePolicies).where(where),
      this.db
        .select()
        .from(attendancePolicies)
        .where(where)
        .orderBy(sortDirFn(sortCol), desc(attendancePolicies.id))
        .limit(query.pageSize)
        .offset(offset),
    ]);

    const scheduleCounts = await this.getScheduleCounts(rows.map((r) => r.id));
    const total = Number(totalRow?.value ?? 0);

    return {
      data: rows.map((row) => this.toRecord(row, scheduleCounts.get(row.id) ?? 0)),
      meta: {
        total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async getOptions(): Promise<AttendancePolicyOptionsResponse> {
    const rows = await this.db
      .select({
        id: attendancePolicies.id,
        name: attendancePolicies.name,
        isDefault: attendancePolicies.isDefault,
        tardyGraceSeconds: attendancePolicies.tardyGraceSeconds,
        tardyCountFrom: attendancePolicies.tardyCountFrom,
      })
      .from(attendancePolicies)
      .where(eq(attendancePolicies.isActive, true))
      .orderBy(desc(attendancePolicies.isDefault), asc(attendancePolicies.name));

    const defaultRow = rows.find((r) => r.isDefault) ?? null;

    return {
      defaultPolicyId: defaultRow?.id ?? null,
      defaultPolicyName: defaultRow?.name ?? null,
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        isDefault: r.isDefault,
        tardyGraceSeconds: r.tardyGraceSeconds,
        tardyCountFrom: r.tardyCountFrom as TardyCountFrom,
      })),
    };
  }

  async getById(id: number): Promise<AttendancePolicyRecord> {
    const [row] = await this.db
      .select()
      .from(attendancePolicies)
      .where(eq(attendancePolicies.id, id))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Attendance policy #${id} not found`);
    }

    const counts = await this.getScheduleCounts([id]);
    return this.toRecord(row, counts.get(id) ?? 0);
  }

  async create(dto: CreateAttendancePolicyDto): Promise<AttendancePolicyRecord> {
    try {
      return await this.db.transaction(async (tx) => {
        const isActive = dto.isActive ?? true;
        const isDefault = dto.isDefault ?? false;

        if (isDefault && !isActive) {
          throw new BadRequestException("System default policy must be active");
        }
        if (
          dto.absentAfterLateSeconds !== null &&
          dto.absentAfterLateSeconds !== undefined &&
          dto.absentAfterLateSeconds <= dto.tardyGraceSeconds
        ) {
          throw new BadRequestException(
            "Mark absent after late must be strictly greater than tardy grace period",
          );
        }

        if (isDefault) {
          await tx
            .select({ id: attendancePolicies.id })
            .from(attendancePolicies)
            .where(eq(attendancePolicies.isDefault, true))
            .for("update");
          await tx
            .update(attendancePolicies)
            .set({ isDefault: false, updatedAt: new Date() })
            .where(eq(attendancePolicies.isDefault, true));
        }

        const [created] = await tx
          .insert(attendancePolicies)
          .values({
            name: dto.name,
            description: dto.description ?? null,
            tardyGraceSeconds: dto.tardyGraceSeconds,
            tardyCountFrom: dto.tardyCountFrom,
            absentAfterLateSeconds: dto.absentAfterLateSeconds ?? null,
            undertimeGraceSeconds: dto.undertimeGraceSeconds,
            earlyInWindowSeconds: dto.earlyInWindowSeconds,
            lateOutWindowSeconds: dto.lateOutWindowSeconds,
            duplicateTapWindowSeconds: dto.duplicateTapWindowSeconds,
            isDefault,
            isActive,
          })
          .returning();

        if (!created) {
          throw new Error("Failed to create attendance policy");
        }

        return this.toRecord(created, 0);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`Attendance policy "${dto.name}" already exists`);
      }
      throw error;
    }
  }

  async update(id: number, dto: UpdateAttendancePolicyDto): Promise<AttendancePolicyRecord> {
    try {
      return await this.db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(attendancePolicies)
          .where(eq(attendancePolicies.id, id))
          .for("update");

        if (!existing) {
          throw new NotFoundException(`Attendance policy #${id} not found`);
        }

        const nextTardyGrace = dto.tardyGraceSeconds ?? existing.tardyGraceSeconds;
        const nextAbsentAfter =
          dto.absentAfterLateSeconds !== undefined
            ? dto.absentAfterLateSeconds
            : existing.absentAfterLateSeconds;
        const nextIsDefault = dto.isDefault ?? existing.isDefault;
        const nextIsActive = dto.isActive ?? existing.isActive;

        if (nextAbsentAfter !== null && nextAbsentAfter <= nextTardyGrace) {
          throw new BadRequestException(
            "Mark absent after late must be strictly greater than tardy grace period",
          );
        }

        if (existing.isDefault && !nextIsActive) {
          throw new BadRequestException(
            "Cannot deactivate the current system default policy. Promote another active policy as default first.",
          );
        }

        if (nextIsDefault && !nextIsActive) {
          throw new BadRequestException("System default policy must be active");
        }

        if (nextIsDefault && !existing.isDefault) {
          await tx
            .select({ id: attendancePolicies.id })
            .from(attendancePolicies)
            .where(and(eq(attendancePolicies.isDefault, true), ne(attendancePolicies.id, id)))
            .for("update");
          await tx
            .update(attendancePolicies)
            .set({ isDefault: false, updatedAt: new Date() })
            .where(and(eq(attendancePolicies.isDefault, true), ne(attendancePolicies.id, id)));
        }

        const [updated] = await tx
          .update(attendancePolicies)
          .set({
            name: dto.name ?? existing.name,
            description: dto.description !== undefined ? dto.description : existing.description,
            tardyGraceSeconds: nextTardyGrace,
            tardyCountFrom: dto.tardyCountFrom ?? existing.tardyCountFrom,
            absentAfterLateSeconds: nextAbsentAfter,
            undertimeGraceSeconds: dto.undertimeGraceSeconds ?? existing.undertimeGraceSeconds,
            earlyInWindowSeconds: dto.earlyInWindowSeconds ?? existing.earlyInWindowSeconds,
            lateOutWindowSeconds: dto.lateOutWindowSeconds ?? existing.lateOutWindowSeconds,
            duplicateTapWindowSeconds:
              dto.duplicateTapWindowSeconds ?? existing.duplicateTapWindowSeconds,
            isDefault: nextIsDefault,
            isActive: nextIsActive,
            updatedAt: new Date(),
          })
          .where(eq(attendancePolicies.id, id))
          .returning();

        if (!updated) {
          throw new NotFoundException(`Attendance policy #${id} not found`);
        }

        const [schedRow] = await tx
          .select({ value: count() })
          .from(schedules)
          .where(eq(schedules.attendancePolicyId, id));

        return this.toRecord(updated, Number(schedRow?.value ?? 0));
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`Attendance policy "${dto.name ?? ""}" already exists`);
      }
      throw error;
    }
  }

  async remove(id: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(attendancePolicies)
        .where(eq(attendancePolicies.id, id))
        .for("update");

      if (!existing) {
        throw new NotFoundException(`Attendance policy #${id} not found`);
      }

      if (existing.isDefault) {
        throw new ConflictException(
          "Cannot delete the system default policy. Promote another active policy as default first.",
        );
      }

      const [schedRow] = await tx
        .select({ value: count() })
        .from(schedules)
        .where(eq(schedules.attendancePolicyId, id));
      const linkedCount = Number(schedRow?.value ?? 0);

      if (linkedCount > 0) {
        throw new ConflictException(
          `Cannot delete policy because it is linked to ${linkedCount} work schedule template${linkedCount === 1 ? "" : "s"}. Deactivate it instead.`,
        );
      }

      await tx.delete(attendancePolicies).where(eq(attendancePolicies.id, id));
    });
  }

  private async getScheduleCounts(ids: number[]): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    if (ids.length === 0) {
      return map;
    }
    const grouped = await this.db
      .select({ policyId: schedules.attendancePolicyId, total: count() })
      .from(schedules)
      .where(inArray(schedules.attendancePolicyId, ids))
      .groupBy(schedules.attendancePolicyId);

    for (const row of grouped) {
      if (row.policyId !== null) {
        map.set(row.policyId, Number(row.total));
      }
    }
    return map;
  }

  private toRecord(
    row: typeof attendancePolicies.$inferSelect,
    scheduleCount: number,
  ): AttendancePolicyRecord {
    const deleteBlockedReason = row.isDefault
      ? "System default policy cannot be deleted"
      : scheduleCount > 0
        ? `Linked to ${scheduleCount} work schedule${scheduleCount === 1 ? "" : "s"}`
        : null;

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      tardyGraceSeconds: row.tardyGraceSeconds,
      tardyCountFrom: row.tardyCountFrom as TardyCountFrom,
      absentAfterLateSeconds: row.absentAfterLateSeconds,
      undertimeGraceSeconds: row.undertimeGraceSeconds,
      earlyInWindowSeconds: row.earlyInWindowSeconds,
      lateOutWindowSeconds: row.lateOutWindowSeconds,
      duplicateTapWindowSeconds: row.duplicateTapWindowSeconds,
      isDefault: row.isDefault,
      isActive: row.isActive,
      scheduleCount,
      canDelete: deleteBlockedReason === null,
      deleteBlockedReason,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
