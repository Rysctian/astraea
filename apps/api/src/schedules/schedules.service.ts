import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  attendancePolicies,
  type Database,
  employeeSchedules,
  employees,
  scheduleDetails,
  schedules,
  users,
} from "@starter/db";
import {
  type BatchAssignScheduleDto,
  type CreateScheduleDto,
  type EmployeeScheduleRecord,
  getCodeDay,
  type ListEmployeeSchedulesQuery,
  type ListSchedulesQuery,
  type PaginatedResponse,
  type ResolvedScheduleDay,
  type ResolvedScheduleResponse,
  type ResolvedShiftSlot,
  type ResolveScheduleQuery,
  type ScheduleDetailInput,
  type ScheduleDetailRecord,
  type ScheduleRecord,
  timeToMinutes,
  type UpdateEmployeeScheduleDto,
  type UpdateScheduleDto,
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
  isNull,
  lte,
  ne,
  or,
  type SQL,
} from "drizzle-orm";
import { DB } from "../database/database.module.js";

const FAR_FUTURE_DATE = "9999-12-31";

function getTodayInTimezone(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const year = parts.find((p) => p.type === "year")?.value ?? "2026";
    const month = parts.find((p) => p.type === "month")?.value ?? "01";
    const day = parts.find((p) => p.type === "day")?.value ?? "01";
    return `${year}-${month}-${day}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function addDaysToDate(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, (d ?? 1) + delta));
  return dt.toISOString().slice(0, 10);
}

function getIsoDayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const day = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  return day === 0 ? 7 : day;
}

function formatEmployeeName(emp: {
  firstName: string;
  middleName: string | null;
  lastName: string;
}): string {
  return [emp.firstName, emp.middleName, emp.lastName].filter(Boolean).join(" ");
}

function checkAdjacentMidnightOverlap(
  prevDetails: Array<{
    dayOfWeek: number;
    isRestDay: boolean;
    startTime: string | null;
    endTime: string | null;
  }>,
  prevDate: string,
  nextDetails: Array<{
    dayOfWeek: number;
    isRestDay: boolean;
    startTime: string | null;
    endTime: string | null;
  }>,
  nextDate: string,
): string | null {
  const prevDow = getIsoDayOfWeek(prevDate);
  const nextDow = getIsoDayOfWeek(nextDate);

  const prevOvernightEnds: number[] = [];
  for (const slot of prevDetails) {
    if (slot.dayOfWeek !== prevDow || slot.isRestDay || !slot.startTime || !slot.endTime) {
      continue;
    }
    const startMin = timeToMinutes(slot.startTime);
    const endMin = timeToMinutes(slot.endTime);
    if (endMin < startMin) {
      prevOvernightEnds.push(endMin);
    }
  }

  if (prevOvernightEnds.length === 0) {
    return null;
  }

  const maxSpilloverEnd = Math.max(...prevOvernightEnds);
  for (const slot of nextDetails) {
    if (slot.dayOfWeek !== nextDow || slot.isRestDay || !slot.startTime) {
      continue;
    }
    const nextStartMin = timeToMinutes(slot.startTime);
    if (nextStartMin < maxSpilloverEnd) {
      return `Adjacent cross-midnight shift collision between ${prevDate} overnight shift and ${nextDate} shift starting at ${slot.startTime.slice(0, 5)}`;
    }
  }

  return null;
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const pgError = error as { code?: string; cause?: { code?: string } };
  return pgError.code === "23505" || pgError.cause?.code === "23505";
}

@Injectable()
export class SchedulesService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async listSchedules(query: ListSchedulesQuery): Promise<PaginatedResponse<ScheduleRecord>> {
    const offset = (query.page - 1) * query.pageSize;
    const conditions: SQL[] = [];

    if (query.search) {
      const p = `%${query.search}%`;
      const cond = or(ilike(schedules.name, p), ilike(schedules.timezone, p));
      if (cond) {
        conditions.push(cond);
      }
    }
    if (query.status === "active") {
      conditions.push(eq(schedules.isActive, true));
    } else if (query.status === "inactive") {
      conditions.push(eq(schedules.isActive, false));
    }
    if (query.timezone) {
      conditions.push(eq(schedules.timezone, query.timezone));
    }
    if (query.createdFrom) {
      conditions.push(gte(schedules.createdAt, new Date(`${query.createdFrom}T00:00:00Z`)));
    }
    if (query.createdTo) {
      conditions.push(lte(schedules.createdAt, new Date(`${query.createdTo}T23:59:59.999Z`)));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const sortDirFn = query.sortDir === "asc" ? asc : desc;
    const sortCol =
      query.sortBy === "name"
        ? schedules.name
        : query.sortBy === "timezone"
          ? schedules.timezone
          : query.sortBy === "isActive"
            ? schedules.isActive
            : schedules.createdAt;

    const [[totalRow], rows] = await Promise.all([
      this.db.select({ value: count() }).from(schedules).where(where),
      this.db
        .select()
        .from(schedules)
        .where(where)
        .orderBy(sortDirFn(sortCol), desc(schedules.id))
        .limit(query.pageSize)
        .offset(offset),
    ]);

    const enriched = await this.hydrateSchedules(rows);
    const total = Number(totalRow?.value ?? 0);

    return {
      data: enriched,
      meta: {
        total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async getScheduleById(id: number): Promise<ScheduleRecord> {
    const [row] = await this.db.select().from(schedules).where(eq(schedules.id, id)).limit(1);
    if (!row) {
      throw new NotFoundException(`Schedule template #${id} not found`);
    }
    const [hydrated] = await this.hydrateSchedules([row]);
    if (!hydrated) {
      throw new NotFoundException(`Schedule template #${id} not found`);
    }
    return hydrated;
  }

  async createSchedule(dto: CreateScheduleDto): Promise<ScheduleRecord> {
    const createdId = await this.db.transaction(async (tx) => {
      if (dto.attendancePolicyId) {
        const [policy] = await tx
          .select({ id: attendancePolicies.id, isActive: attendancePolicies.isActive })
          .from(attendancePolicies)
          .where(eq(attendancePolicies.id, dto.attendancePolicyId))
          .limit(1);

        if (!policy) {
          throw new BadRequestException("Selected attendance policy does not exist");
        }
        if (!policy.isActive) {
          throw new BadRequestException("Selected attendance policy is inactive");
        }
      }

      const [created] = await tx
        .insert(schedules)
        .values({
          name: dto.name,
          timezone: dto.timezone,
          attendancePolicyId: dto.attendancePolicyId ?? null,
          isActive: dto.isActive,
        })
        .returning();

      if (!created) {
        throw new Error("Failed to create schedule template");
      }

      await tx
        .insert(scheduleDetails)
        .values(dto.details.map((slot) => this.buildDetailInsert(created.id, slot)));

      return created.id;
    });

    return this.getScheduleById(createdId);
  }

  async updateSchedule(id: number, dto: UpdateScheduleDto): Promise<ScheduleRecord> {
    await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(schedules)
        .where(eq(schedules.id, id))
        .for("update");

      if (!existing) {
        throw new NotFoundException(`Schedule template #${id} not found`);
      }

      const [assignRow] = await tx
        .select({ value: count() })
        .from(employeeSchedules)
        .where(eq(employeeSchedules.scheduleId, id));
      const isLocked = Number(assignRow?.value ?? 0) > 0;

      if (isLocked) {
        if (dto.timezone !== undefined && dto.timezone !== existing.timezone) {
          throw new ConflictException(
            "Timezone is locked because this schedule has employee assignments. Archive this template and create a new one.",
          );
        }
        if (dto.details !== undefined) {
          throw new ConflictException(
            "Shift slots are locked because this schedule has employee assignments. Archive this template and create a new one.",
          );
        }
      }

      if (
        dto.attendancePolicyId !== undefined &&
        dto.attendancePolicyId !== null &&
        dto.attendancePolicyId !== existing.attendancePolicyId
      ) {
        const [policy] = await tx
          .select({ id: attendancePolicies.id, isActive: attendancePolicies.isActive })
          .from(attendancePolicies)
          .where(eq(attendancePolicies.id, dto.attendancePolicyId))
          .limit(1);

        if (!policy) {
          throw new BadRequestException("Selected attendance policy does not exist");
        }
        if (!policy.isActive) {
          throw new BadRequestException("Selected attendance policy is inactive");
        }
      }

      await tx
        .update(schedules)
        .set({
          name: dto.name ?? existing.name,
          timezone: dto.timezone ?? existing.timezone,
          attendancePolicyId:
            dto.attendancePolicyId !== undefined
              ? dto.attendancePolicyId
              : existing.attendancePolicyId,
          isActive: dto.isActive ?? existing.isActive,
          updatedAt: new Date(),
        })
        .where(eq(schedules.id, id));

      if (!isLocked && dto.details !== undefined) {
        await tx.delete(scheduleDetails).where(eq(scheduleDetails.scheduleId, id));
        await tx
          .insert(scheduleDetails)
          .values(dto.details.map((slot) => this.buildDetailInsert(id, slot)));
      }
    });

    return this.getScheduleById(id);
  }

  async deleteSchedule(id: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: schedules.id })
        .from(schedules)
        .where(eq(schedules.id, id))
        .for("update");

      if (!existing) {
        throw new NotFoundException(`Schedule template #${id} not found`);
      }

      const [assignRow] = await tx
        .select({ value: count() })
        .from(employeeSchedules)
        .where(eq(employeeSchedules.scheduleId, id));
      const assignCount = Number(assignRow?.value ?? 0);

      if (assignCount > 0) {
        throw new ConflictException(
          `Cannot delete schedule template because it has ${assignCount} employee assignment${assignCount === 1 ? "" : "s"}. Archive it instead.`,
        );
      }

      await tx.delete(schedules).where(eq(schedules.id, id));
    });
  }

  async listAssignments(
    query: ListEmployeeSchedulesQuery,
  ): Promise<PaginatedResponse<EmployeeScheduleRecord>> {
    const conditions: SQL[] = [];

    if (query.employeeId) {
      conditions.push(eq(employeeSchedules.employeeId, query.employeeId));
    }
    if (query.scheduleId) {
      conditions.push(eq(employeeSchedules.scheduleId, query.scheduleId));
    }
    if (query.effectiveFrom) {
      conditions.push(eq(employeeSchedules.effectiveFrom, query.effectiveFrom));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const sortDirFn = query.sortDir === "asc" ? asc : desc;
    const sortCol =
      query.sortBy === "effectiveTo"
        ? employeeSchedules.effectiveTo
        : query.sortBy === "createdAt"
          ? employeeSchedules.createdAt
          : employeeSchedules.effectiveFrom;

    const rawRows = await this.db
      .select({
        assignment: employeeSchedules,
        empFirstName: employees.firstName,
        empMiddleName: employees.middleName,
        empLastName: employees.lastName,
        scheduleName: schedules.name,
        scheduleTimezone: schedules.timezone,
        assignedByName: users.name,
      })
      .from(employeeSchedules)
      .innerJoin(employees, eq(employeeSchedules.employeeId, employees.employeeId))
      .innerJoin(schedules, eq(employeeSchedules.scheduleId, schedules.id))
      .leftJoin(users, eq(employeeSchedules.assignedBy, users.id))
      .where(where)
      .orderBy(sortDirFn(sortCol), desc(employeeSchedules.id));

    const mapped = rawRows.map((r) => this.toAssignmentRecord(r));

    const filtered =
      query.status === "current"
        ? mapped.filter((row) => row.isCurrent)
        : query.status === "history_or_upcoming"
          ? mapped.filter((row) => !row.isCurrent)
          : mapped;

    const total = filtered.length;
    const offset = (query.page - 1) * query.pageSize;
    const paged = filtered.slice(offset, offset + query.pageSize);

    return {
      data: paged,
      meta: {
        total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async batchAssign(
    dto: BatchAssignScheduleDto,
    actorUserId: string,
  ): Promise<EmployeeScheduleRecord[]> {
    const sortedEmpIds = [...dto.employeeIds].sort();

    try {
      const insertedIds = await this.db.transaction(async (tx) => {
        const [schedule] = await tx
          .select()
          .from(schedules)
          .where(eq(schedules.id, dto.scheduleId))
          .for("update");

        if (!schedule) {
          throw new NotFoundException(`Schedule template #${dto.scheduleId} not found`);
        }
        if (!schedule.isActive) {
          throw new BadRequestException("Cannot assign an inactive/archived schedule template");
        }

        const newDetails = await tx
          .select()
          .from(scheduleDetails)
          .where(eq(scheduleDetails.scheduleId, schedule.id));
        const configuredDays = new Set(newDetails.map((d) => d.dayOfWeek));
        if (configuredDays.size < 7) {
          throw new BadRequestException(
            "Schedule template must configure all 7 weekdays before assignment",
          );
        }

        const lockedEmployees = await tx
          .select({ employeeId: employees.employeeId })
          .from(employees)
          .where(inArray(employees.employeeId, sortedEmpIds))
          .orderBy(asc(employees.employeeId))
          .for("update");

        if (lockedEmployees.length !== sortedEmpIds.length) {
          const found = new Set(lockedEmployees.map((e) => e.employeeId));
          const missing = sortedEmpIds.filter((id) => !found.has(id));
          throw new NotFoundException(`Employee(s) not found: ${missing.join(", ")}`);
        }

        const existingAssignments = await tx
          .select()
          .from(employeeSchedules)
          .where(inArray(employeeSchedules.employeeId, sortedEmpIds));

        const otherScheduleIds = Array.from(new Set(existingAssignments.map((a) => a.scheduleId)));
        const otherDetailsRows =
          otherScheduleIds.length > 0
            ? await tx
                .select()
                .from(scheduleDetails)
                .where(inArray(scheduleDetails.scheduleId, otherScheduleIds))
            : [];
        const detailsByScheduleId = new Map<number, typeof otherDetailsRows>();
        for (const d of otherDetailsRows) {
          const list = detailsByScheduleId.get(d.scheduleId) ?? [];
          list.push(d);
          detailsByScheduleId.set(d.scheduleId, list);
        }

        const newStart = dto.effectiveFrom;
        const newEnd = dto.effectiveTo ?? FAR_FUTURE_DATE;
        const prevDayOfNewStart = addDaysToDate(newStart, -1);
        const nextDayOfNewEnd = dto.effectiveTo ? addDaysToDate(dto.effectiveTo, 1) : null;

        const existingByEmployee = new Map<string, typeof existingAssignments>();
        for (const row of existingAssignments) {
          const list = existingByEmployee.get(row.employeeId) ?? [];
          list.push(row);
          existingByEmployee.set(row.employeeId, list);
        }

        for (const empId of sortedEmpIds) {
          const rows = existingByEmployee.get(empId) ?? [];
          for (const existing of rows) {
            const exStart = existing.effectiveFrom;
            const exEnd = existing.effectiveTo ?? FAR_FUTURE_DATE;

            if (exStart <= newEnd && newStart <= exEnd) {
              throw new ConflictException(
                `Employee ${empId} already has an overlapping schedule (${exStart} to ${existing.effectiveTo ?? "Ongoing"})`,
              );
            }

            if (existing.effectiveTo && existing.effectiveTo === prevDayOfNewStart) {
              const exDetails = detailsByScheduleId.get(existing.scheduleId) ?? [];
              const collision = checkAdjacentMidnightOverlap(
                exDetails,
                existing.effectiveTo,
                newDetails,
                newStart,
              );
              if (collision) {
                throw new ConflictException(`Employee ${empId}: ${collision}`);
              }
            }

            if (nextDayOfNewEnd && existing.effectiveFrom === nextDayOfNewEnd && dto.effectiveTo) {
              const exDetails = detailsByScheduleId.get(existing.scheduleId) ?? [];
              const collision = checkAdjacentMidnightOverlap(
                newDetails,
                dto.effectiveTo,
                exDetails,
                existing.effectiveFrom,
              );
              if (collision) {
                throw new ConflictException(`Employee ${empId}: ${collision}`);
              }
            }
          }
        }

        const inserted = await tx
          .insert(employeeSchedules)
          .values(
            sortedEmpIds.map((employeeId) => ({
              employeeId,
              scheduleId: dto.scheduleId,
              effectiveFrom: dto.effectiveFrom,
              effectiveTo: dto.effectiveTo ?? null,
              assignedBy: actorUserId,
            })),
          )
          .returning({ id: employeeSchedules.id });

        return inserted.map((r) => r.id);
      });

      const createdRows = await this.db
        .select({
          assignment: employeeSchedules,
          empFirstName: employees.firstName,
          empMiddleName: employees.middleName,
          empLastName: employees.lastName,
          scheduleName: schedules.name,
          scheduleTimezone: schedules.timezone,
          assignedByName: users.name,
        })
        .from(employeeSchedules)
        .innerJoin(employees, eq(employeeSchedules.employeeId, employees.employeeId))
        .innerJoin(schedules, eq(employeeSchedules.scheduleId, schedules.id))
        .leftJoin(users, eq(employeeSchedules.assignedBy, users.id))
        .where(inArray(employeeSchedules.id, insertedIds))
        .orderBy(asc(employeeSchedules.employeeId));

      return createdRows.map((r) => this.toAssignmentRecord(r));
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          "One or more employees already have an assignment starting on this effective date",
        );
      }
      throw error;
    }
  }

  async updateAssignment(
    id: number,
    dto: UpdateEmployeeScheduleDto,
  ): Promise<EmployeeScheduleRecord> {
    await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(employeeSchedules)
        .where(eq(employeeSchedules.id, id))
        .for("update");

      if (!existing) {
        throw new NotFoundException(`Schedule assignment #${id} not found`);
      }

      const [schedule] = await tx
        .select()
        .from(schedules)
        .where(eq(schedules.id, existing.scheduleId))
        .limit(1);

      if (!schedule) {
        throw new NotFoundException(`Schedule template #${existing.scheduleId} not found`);
      }

      const today = getTodayInTimezone(schedule.timezone);

      if (existing.effectiveTo !== null && existing.effectiveTo < today) {
        throw new BadRequestException("Past schedule assignments cannot be modified");
      }

      if (dto.effectiveTo !== null) {
        if (dto.effectiveTo < today) {
          throw new BadRequestException(
            `Effective end date must be on or after today (${today} in ${schedule.timezone})`,
          );
        }
        if (dto.effectiveTo < existing.effectiveFrom) {
          throw new BadRequestException(
            `Effective end date must be on or after effective start date (${existing.effectiveFrom})`,
          );
        }
      }

      const others = await tx
        .select()
        .from(employeeSchedules)
        .where(
          and(eq(employeeSchedules.employeeId, existing.employeeId), ne(employeeSchedules.id, id)),
        );

      const newStart = existing.effectiveFrom;
      const newEnd = dto.effectiveTo ?? FAR_FUTURE_DATE;
      const nextDayOfNewEnd = dto.effectiveTo ? addDaysToDate(dto.effectiveTo, 1) : null;

      const relevantScheduleIds = Array.from(
        new Set([existing.scheduleId, ...others.map((o) => o.scheduleId)]),
      );
      const detailRows = await tx
        .select()
        .from(scheduleDetails)
        .where(inArray(scheduleDetails.scheduleId, relevantScheduleIds));
      const detailsBySched = new Map<number, typeof detailRows>();
      for (const d of detailRows) {
        const list = detailsBySched.get(d.scheduleId) ?? [];
        list.push(d);
        detailsBySched.set(d.scheduleId, list);
      }

      const thisDetails = detailsBySched.get(existing.scheduleId) ?? [];

      for (const other of others) {
        const oStart = other.effectiveFrom;
        const oEnd = other.effectiveTo ?? FAR_FUTURE_DATE;

        if (oStart <= newEnd && newStart <= oEnd) {
          throw new ConflictException(
            `Updated date range overlaps with existing assignment (${oStart} to ${other.effectiveTo ?? "Ongoing"})`,
          );
        }

        if (nextDayOfNewEnd && other.effectiveFrom === nextDayOfNewEnd && dto.effectiveTo) {
          const otherDetails = detailsBySched.get(other.scheduleId) ?? [];
          const collision = checkAdjacentMidnightOverlap(
            thisDetails,
            dto.effectiveTo,
            otherDetails,
            other.effectiveFrom,
          );
          if (collision) {
            throw new ConflictException(collision);
          }
        }
      }

      await tx
        .update(employeeSchedules)
        .set({
          effectiveTo: dto.effectiveTo,
          updatedAt: new Date(),
        })
        .where(eq(employeeSchedules.id, id));
    });

    const [updated] = await this.db
      .select({
        assignment: employeeSchedules,
        empFirstName: employees.firstName,
        empMiddleName: employees.middleName,
        empLastName: employees.lastName,
        scheduleName: schedules.name,
        scheduleTimezone: schedules.timezone,
        assignedByName: users.name,
      })
      .from(employeeSchedules)
      .innerJoin(employees, eq(employeeSchedules.employeeId, employees.employeeId))
      .innerJoin(schedules, eq(employeeSchedules.scheduleId, schedules.id))
      .leftJoin(users, eq(employeeSchedules.assignedBy, users.id))
      .where(eq(employeeSchedules.id, id))
      .limit(1);

    if (!updated) {
      throw new NotFoundException(`Schedule assignment #${id} not found`);
    }

    return this.toAssignmentRecord(updated);
  }

  async deleteAssignment(id: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(employeeSchedules)
        .where(eq(employeeSchedules.id, id))
        .for("update");

      if (!existing) {
        throw new NotFoundException(`Schedule assignment #${id} not found`);
      }

      const [schedule] = await tx
        .select({ timezone: schedules.timezone })
        .from(schedules)
        .where(eq(schedules.id, existing.scheduleId))
        .limit(1);

      const today = getTodayInTimezone(schedule?.timezone ?? "Asia/Manila");
      if (existing.effectiveFrom <= today) {
        throw new ConflictException(
          "Current or historical assignments cannot be deleted. End the assignment by setting an effective end date instead.",
        );
      }

      await tx.delete(employeeSchedules).where(eq(employeeSchedules.id, id));
    });
  }

  async resolveEmployeeSchedule(
    employeeId: string,
    query: ResolveScheduleQuery,
  ): Promise<ResolvedScheduleResponse> {
    const [emp] = await this.db
      .select({ employeeId: employees.employeeId })
      .from(employees)
      .where(eq(employees.employeeId, employeeId))
      .limit(1);

    if (!emp) {
      throw new NotFoundException(`Employee ${employeeId} not found`);
    }

    const assignments = await this.db
      .select({
        assignment: employeeSchedules,
        schedule: schedules,
      })
      .from(employeeSchedules)
      .innerJoin(schedules, eq(employeeSchedules.scheduleId, schedules.id))
      .where(
        and(
          eq(employeeSchedules.employeeId, employeeId),
          lte(employeeSchedules.effectiveFrom, query.to),
          or(isNull(employeeSchedules.effectiveTo), gte(employeeSchedules.effectiveTo, query.from)),
        ),
      );

    const scheduleIds = Array.from(new Set(assignments.map((a) => a.schedule.id)));
    const detailRows =
      scheduleIds.length > 0
        ? await this.db
            .select()
            .from(scheduleDetails)
            .where(inArray(scheduleDetails.scheduleId, scheduleIds))
            .orderBy(asc(scheduleDetails.dayOfWeek), asc(scheduleDetails.startTime))
        : [];

    const detailsBySchedule = new Map<number, typeof detailRows>();
    for (const d of detailRows) {
      const list = detailsBySchedule.get(d.scheduleId) ?? [];
      list.push(d);
      detailsBySchedule.set(d.scheduleId, list);
    }

    const days: ResolvedScheduleDay[] = [];
    let cursor = query.from;

    while (cursor <= query.to) {
      const dayOfWeek = getIsoDayOfWeek(cursor);
      const codeDay = getCodeDay(dayOfWeek);

      const matched = assignments.find(
        (a) =>
          a.assignment.effectiveFrom <= cursor &&
          (a.assignment.effectiveTo === null || a.assignment.effectiveTo >= cursor),
      );

      if (!matched) {
        days.push({
          date: cursor,
          dayOfWeek,
          codeDay,
          status: "unassigned",
          scheduleId: null,
          scheduleName: null,
          timezone: null,
          attendancePolicyId: null,
          totalScheduledMinutes: 0,
          slots: [],
        });
      } else {
        const daySlots = (detailsBySchedule.get(matched.schedule.id) ?? []).filter(
          (d) => d.dayOfWeek === dayOfWeek,
        );
        const isRest = daySlots.length === 0 || daySlots.some((d) => d.isRestDay);

        if (isRest) {
          days.push({
            date: cursor,
            dayOfWeek,
            codeDay,
            status: "rest_day",
            scheduleId: matched.schedule.id,
            scheduleName: matched.schedule.name,
            timezone: matched.schedule.timezone,
            attendancePolicyId: matched.schedule.attendancePolicyId,
            totalScheduledMinutes: 0,
            slots: [],
          });
        } else {
          const nextDate = addDaysToDate(cursor, 1);
          const resolvedSlots: ResolvedShiftSlot[] = [];
          let totalMinutes = 0;

          for (const slot of daySlots) {
            if (!slot.startTime || !slot.endTime) {
              continue;
            }
            const startMin = timeToMinutes(slot.startTime);
            const endMin = timeToMinutes(slot.endTime);
            const isOvernight = endMin < startMin;
            const durationMinutes = Math.round(
              isOvernight ? 1440 - startMin + endMin : endMin - startMin,
            );
            totalMinutes += durationMinutes;

            resolvedSlots.push({
              startTime: slot.startTime,
              endTime: slot.endTime,
              isOvernight,
              startsAt: `${cursor}T${slot.startTime}`,
              endsAt: `${isOvernight ? nextDate : cursor}T${slot.endTime}`,
              tardyStart: slot.tardyStart,
              undertimeStart: slot.undertimeStart,
              earlyDismissalStart: slot.earlyDismissalStart,
              durationMinutes,
            });
          }

          days.push({
            date: cursor,
            dayOfWeek,
            codeDay,
            status: "working",
            scheduleId: matched.schedule.id,
            scheduleName: matched.schedule.name,
            timezone: matched.schedule.timezone,
            attendancePolicyId: matched.schedule.attendancePolicyId,
            totalScheduledMinutes: totalMinutes,
            slots: resolvedSlots,
          });
        }
      }

      cursor = addDaysToDate(cursor, 1);
    }

    return {
      employeeId,
      from: query.from,
      to: query.to,
      days,
    };
  }

  private buildDetailInsert(scheduleId: number, slot: ScheduleDetailInput) {
    return {
      scheduleId,
      dayOfWeek: slot.dayOfWeek,
      codeDay: getCodeDay(slot.dayOfWeek),
      isRestDay: slot.isRestDay,
      startTime: slot.isRestDay ? null : (slot.startTime ?? null),
      endTime: slot.isRestDay ? null : (slot.endTime ?? null),
      tardyStart: slot.isRestDay ? null : (slot.tardyStart ?? null),
      undertimeStart: slot.isRestDay ? null : (slot.undertimeStart ?? null),
      earlyDismissalStart: slot.isRestDay ? null : (slot.earlyDismissalStart ?? null),
    };
  }

  private async hydrateSchedules(
    rows: Array<typeof schedules.$inferSelect>,
  ): Promise<ScheduleRecord[]> {
    if (rows.length === 0) {
      return [];
    }

    const ids = rows.map((r) => r.id);
    const policyIds = Array.from(
      new Set(rows.map((r) => r.attendancePolicyId).filter((id): id is number => id !== null)),
    );

    const [detailRows, assignCounts, policyRows] = await Promise.all([
      this.db
        .select()
        .from(scheduleDetails)
        .where(inArray(scheduleDetails.scheduleId, ids))
        .orderBy(asc(scheduleDetails.dayOfWeek), asc(scheduleDetails.startTime)),
      this.db
        .select({ scheduleId: employeeSchedules.scheduleId, total: count() })
        .from(employeeSchedules)
        .where(inArray(employeeSchedules.scheduleId, ids))
        .groupBy(employeeSchedules.scheduleId),
      policyIds.length > 0
        ? this.db
            .select({ id: attendancePolicies.id, name: attendancePolicies.name })
            .from(attendancePolicies)
            .where(inArray(attendancePolicies.id, policyIds))
        : Promise.resolve([]),
    ]);

    const detailsMap = new Map<number, ScheduleDetailRecord[]>();
    for (const d of detailRows) {
      const list = detailsMap.get(d.scheduleId) ?? [];
      list.push({
        id: d.id,
        scheduleId: d.scheduleId,
        dayOfWeek: d.dayOfWeek,
        codeDay: d.codeDay,
        isRestDay: d.isRestDay,
        startTime: d.startTime,
        endTime: d.endTime,
        tardyStart: d.tardyStart,
        undertimeStart: d.undertimeStart,
        earlyDismissalStart: d.earlyDismissalStart,
      });
      detailsMap.set(d.scheduleId, list);
    }

    const countMap = new Map(assignCounts.map((c) => [c.scheduleId, Number(c.total)]));
    const policyMap = new Map(policyRows.map((p) => [p.id, p.name]));

    return rows.map((row) => {
      const details = detailsMap.get(row.id) ?? [];
      const workingDays = new Set(details.filter((d) => !d.isRestDay).map((d) => d.dayOfWeek));
      const assignmentCount = countMap.get(row.id) ?? 0;

      return {
        id: row.id,
        name: row.name,
        timezone: row.timezone,
        attendancePolicyId: row.attendancePolicyId,
        attendancePolicyName:
          row.attendancePolicyId !== null ? (policyMap.get(row.attendancePolicyId) ?? null) : null,
        isActive: row.isActive,
        workingDaysCount: workingDays.size,
        assignmentCount,
        isLocked: assignmentCount > 0,
        details,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    });
  }

  private toAssignmentRecord(row: {
    assignment: typeof employeeSchedules.$inferSelect;
    empFirstName: string;
    empMiddleName: string | null;
    empLastName: string;
    scheduleName: string;
    scheduleTimezone: string;
    assignedByName: string | null;
  }): EmployeeScheduleRecord {
    const today = getTodayInTimezone(row.scheduleTimezone);
    const isPast = row.assignment.effectiveTo !== null && row.assignment.effectiveTo < today;
    const isFuture = row.assignment.effectiveFrom > today;
    const isCurrent = !isPast && !isFuture;

    return {
      id: row.assignment.id,
      employeeId: row.assignment.employeeId,
      employeeName: formatEmployeeName({
        firstName: row.empFirstName,
        middleName: row.empMiddleName,
        lastName: row.empLastName,
      }),
      scheduleId: row.assignment.scheduleId,
      scheduleName: row.scheduleName,
      scheduleTimezone: row.scheduleTimezone,
      effectiveFrom: row.assignment.effectiveFrom,
      effectiveTo: row.assignment.effectiveTo,
      assignedBy: row.assignment.assignedBy,
      assignedByName: row.assignedByName,
      isCurrent,
      isPast,
      isFuture,
      createdAt: row.assignment.createdAt.toISOString(),
      updatedAt: row.assignment.updatedAt.toISOString(),
    };
  }
}
