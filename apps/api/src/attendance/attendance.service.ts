import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  attendancePolicies,
  type Database,
  employeeLogs,
  employeeSchedules,
  employees,
  scheduleDetails,
  schedules,
  users,
} from "@starter/db";
import {
  type AttendanceLogRecord,
  type AttendanceLogSource,
  type CreateManualLogDto,
  type DtrQuery,
  type DtrResponse,
  type ImportLogsResult,
  type ImportLogsRowError,
  type ListAttendanceLogsQuery,
  type ManualLogResult,
  normalizeTimeString,
  type PaginatedResponse,
  type TardyCountFrom,
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
  or,
  type SQL,
} from "drizzle-orm";
import ExcelJS from "exceljs";
import { DB } from "../database/database.module.js";
import {
  addDaysIso,
  type EvalPolicyRules,
  type EvalScheduleAssignment,
  evaluateDtr,
  localDateTimeToUtcDate,
} from "./dtr-evaluator.js";

const DEFAULT_TZ = "Asia/Manila";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function formatEmployeeName(e: {
  firstName: string;
  middleName: string | null;
  lastName: string;
}): string {
  return [e.firstName, e.middleName, e.lastName].filter(Boolean).join(" ");
}

function parseCsvLines(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.trim());
      if (row.some((c) => c !== "")) {
        rows.push(row);
      }
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  row.push(cell.trim());
  if (row.some((c) => c !== "")) {
    rows.push(row);
  }
  return rows;
}

function coerceDateCell(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  const str = String(raw).trim();
  if (DATE_RE.test(str)) {
    return str;
  }
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

function coerceTimeCell(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const hh = String(raw.getUTCHours()).padStart(2, "0");
    const mm = String(raw.getUTCMinutes()).padStart(2, "0");
    const ss = String(raw.getUTCSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }
  if (typeof raw === "number" && raw >= 0 && raw < 1) {
    const totalSec = Math.round(raw * 86_400);
    const hh = String(Math.floor(totalSec / 3600) % 24).padStart(2, "0");
    const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
    const ss = String(totalSec % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }
  const str = String(raw).trim();
  if (!str) return null;
  const direct = normalizeTimeString(str);
  if (direct) return direct;

  // Handle "8:05" or "08:05 AM" / "5:30 PM"
  const ampm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(str);
  if (ampm) {
    let hh = Number(ampm[1]);
    const mm = Number(ampm[2]);
    const ss = Number(ampm[3] ?? "0");
    const mer = ampm[4]?.toUpperCase();
    if (mer === "PM" && hh < 12) hh += 12;
    if (mer === "AM" && hh === 12) hh = 0;
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59 && ss >= 0 && ss <= 59) {
      return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    }
  }
  return null;
}

@Injectable()
export class AttendanceService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async getDtr(query: DtrQuery): Promise<DtrResponse> {
    const [employee] = await this.db
      .select({
        employeeId: employees.employeeId,
        firstName: employees.firstName,
        middleName: employees.middleName,
        lastName: employees.lastName,
      })
      .from(employees)
      .where(eq(employees.employeeId, query.employeeId))
      .limit(1);

    if (!employee) {
      throw new NotFoundException(`Employee ${query.employeeId} not found`);
    }

    // Fetch schedule assignments overlapping [from, to]
    const rawAssignments = await this.db
      .select({
        assignment: employeeSchedules,
        schedule: schedules,
      })
      .from(employeeSchedules)
      .innerJoin(schedules, eq(employeeSchedules.scheduleId, schedules.id))
      .where(
        and(
          eq(employeeSchedules.employeeId, query.employeeId),
          lte(employeeSchedules.effectiveFrom, query.to),
          or(isNull(employeeSchedules.effectiveTo), gte(employeeSchedules.effectiveTo, query.from)),
        ),
      );

    const scheduleIds = Array.from(new Set(rawAssignments.map((a) => a.schedule.id)));
    const policyIds = Array.from(
      new Set(
        rawAssignments
          .map((a) => a.schedule.attendancePolicyId)
          .filter((id): id is number => id !== null),
      ),
    );

    const logRangeStart = new Date(`${addDaysIso(query.from, -1)}T00:00:00Z`);
    const logRangeEnd = new Date(`${addDaysIso(query.to, 2)}T23:59:59.999Z`);

    const [detailRows, policyRows, defaultPolicyRows, logRows] = await Promise.all([
      scheduleIds.length > 0
        ? this.db
            .select()
            .from(scheduleDetails)
            .where(inArray(scheduleDetails.scheduleId, scheduleIds))
            .orderBy(asc(scheduleDetails.dayOfWeek), asc(scheduleDetails.startTime))
        : Promise.resolve([]),
      policyIds.length > 0
        ? this.db.select().from(attendancePolicies).where(inArray(attendancePolicies.id, policyIds))
        : Promise.resolve([]),
      this.db
        .select()
        .from(attendancePolicies)
        .where(and(eq(attendancePolicies.isActive, true), eq(attendancePolicies.isDefault, true)))
        .limit(1),
      this.db
        .select({ loggedAt: employeeLogs.loggedAt })
        .from(employeeLogs)
        .where(
          and(
            eq(employeeLogs.employeeId, query.employeeId),
            gte(employeeLogs.loggedAt, logRangeStart),
            lte(employeeLogs.loggedAt, logRangeEnd),
          ),
        )
        .orderBy(asc(employeeLogs.loggedAt)),
    ]);

    const detailsBySchedule = new Map<number, typeof detailRows>();
    for (const d of detailRows) {
      const list = detailsBySchedule.get(d.scheduleId) ?? [];
      list.push(d);
      detailsBySchedule.set(d.scheduleId, list);
    }

    const toPolicyRules = (p: typeof attendancePolicies.$inferSelect): EvalPolicyRules => ({
      tardyGraceSeconds: p.tardyGraceSeconds,
      tardyCountFrom: p.tardyCountFrom as TardyCountFrom,
      absentAfterLateSeconds: p.absentAfterLateSeconds,
      undertimeGraceSeconds: p.undertimeGraceSeconds,
      earlyInWindowSeconds: p.earlyInWindowSeconds,
      lateOutWindowSeconds: p.lateOutWindowSeconds,
      duplicateTapWindowSeconds: p.duplicateTapWindowSeconds,
    });

    const policiesById = new Map<number, EvalPolicyRules>(
      policyRows.map((p) => [p.id, toPolicyRules(p)]),
    );
    const defaultPolicy = defaultPolicyRows[0] ? toPolicyRules(defaultPolicyRows[0]) : null;

    const evalAssignments: EvalScheduleAssignment[] = rawAssignments.map((a) => ({
      scheduleId: a.schedule.id,
      scheduleName: a.schedule.name,
      timezone: a.schedule.timezone,
      attendancePolicyId: a.schedule.attendancePolicyId,
      effectiveFrom: a.assignment.effectiveFrom,
      effectiveTo: a.assignment.effectiveTo,
      details: detailsBySchedule.get(a.schedule.id) ?? [],
    }));

    const { rows, summary } = evaluateDtr({
      from: query.from,
      to: query.to,
      assignments: evalAssignments,
      policiesById,
      defaultPolicy,
      logs: logRows.map((l) => l.loggedAt),
    });

    return {
      employeeId: employee.employeeId,
      employeeName: formatEmployeeName(employee),
      from: query.from,
      to: query.to,
      summary,
      rows,
    };
  }

  async listLogs(query: ListAttendanceLogsQuery): Promise<PaginatedResponse<AttendanceLogRecord>> {
    const offset = (query.page - 1) * query.pageSize;
    const conditions: SQL[] = [];

    if (query.employeeId) {
      conditions.push(eq(employeeLogs.employeeId, query.employeeId));
    }
    if (query.source !== "all") {
      conditions.push(eq(employeeLogs.source, query.source));
    }
    if (query.dateFrom) {
      conditions.push(gte(employeeLogs.loggedAt, new Date(`${query.dateFrom}T00:00:00Z`)));
    }
    if (query.dateTo) {
      conditions.push(lte(employeeLogs.loggedAt, new Date(`${query.dateTo}T23:59:59.999Z`)));
    }
    if (query.search) {
      const p = `%${query.search}%`;
      const cond = or(
        ilike(employeeLogs.employeeId, p),
        ilike(employeeLogs.deviceId, p),
        ilike(employeeLogs.source, p),
        ilike(employees.firstName, p),
        ilike(employees.lastName, p),
      );
      if (cond) {
        conditions.push(cond);
      }
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const sortDirFn = query.sortDir === "asc" ? asc : desc;
    const sortCol =
      query.sortBy === "createdAt"
        ? employeeLogs.createdAt
        : query.sortBy === "employeeId"
          ? employeeLogs.employeeId
          : query.sortBy === "source"
            ? employeeLogs.source
            : employeeLogs.loggedAt;

    const [[totalRow], rows] = await Promise.all([
      this.db
        .select({ value: count() })
        .from(employeeLogs)
        .innerJoin(employees, eq(employeeLogs.employeeId, employees.employeeId))
        .where(where),
      this.db
        .select({
          log: employeeLogs,
          empFirstName: employees.firstName,
          empMiddleName: employees.middleName,
          empLastName: employees.lastName,
          createdByName: users.name,
        })
        .from(employeeLogs)
        .innerJoin(employees, eq(employeeLogs.employeeId, employees.employeeId))
        .leftJoin(users, eq(employeeLogs.createdBy, users.id))
        .where(where)
        .orderBy(sortDirFn(sortCol), desc(employeeLogs.id))
        .limit(query.pageSize)
        .offset(offset),
    ]);

    const total = Number(totalRow?.value ?? 0);

    return {
      data: rows.map((r) => ({
        id: r.log.id,
        employeeId: r.log.employeeId,
        employeeName: formatEmployeeName({
          firstName: r.empFirstName,
          middleName: r.empMiddleName,
          lastName: r.empLastName,
        }),
        loggedAt: r.log.loggedAt.toISOString(),
        deviceId: r.log.deviceId,
        source: r.log.source as AttendanceLogSource,
        createdBy: r.log.createdBy,
        createdByName: r.createdByName,
        createdAt: r.log.createdAt.toISOString(),
      })),
      meta: {
        total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async createManualLogs(dto: CreateManualLogDto, actorUserId: string): Promise<ManualLogResult> {
    const [emp] = await this.db
      .select({
        employeeId: employees.employeeId,
        firstName: employees.firstName,
        middleName: employees.middleName,
        lastName: employees.lastName,
      })
      .from(employees)
      .where(eq(employees.employeeId, dto.employeeId))
      .limit(1);

    if (!emp) {
      throw new NotFoundException(`Employee ${dto.employeeId} not found`);
    }

    const tz = await this.resolveEmployeeTimezone(dto.employeeId, dto.date);

    const candidateDates: Date[] = [];
    if (dto.loggedAt) {
      candidateDates.push(new Date(dto.loggedAt));
    }
    if (dto.date) {
      for (const t of [dto.amIn, dto.amOut, dto.pmIn, dto.pmOut]) {
        if (t) {
          candidateDates.push(localDateTimeToUtcDate(dto.date, t, tz));
        }
      }
    }

    // Deduplicate in-request timestamps by exact epoch ms
    const uniqueMs = Array.from(new Set(candidateDates.map((d) => d.getTime()))).sort(
      (a, b) => a - b,
    );
    const uniqueDates = uniqueMs.map((ms) => new Date(ms));

    const existingRows =
      uniqueDates.length > 0
        ? await this.db
            .select({ loggedAt: employeeLogs.loggedAt })
            .from(employeeLogs)
            .where(
              and(
                eq(employeeLogs.employeeId, dto.employeeId),
                inArray(employeeLogs.loggedAt, uniqueDates),
              ),
            )
        : [];
    const existingSet = new Set(existingRows.map((r) => r.loggedAt.getTime()));

    const netNewDates = uniqueDates.filter((d) => !existingSet.has(d.getTime()));
    const skippedCount = uniqueDates.length - netNewDates.length;

    if (netNewDates.length === 0) {
      throw new BadRequestException(
        "All submitted punch timestamps already exist for this employee.",
      );
    }

    const deviceLabel = dto.deviceId ?? "MANUAL-ENTRY";

    const inserted = await this.db.transaction(async (tx) =>
      tx
        .insert(employeeLogs)
        .values(
          netNewDates.map((loggedAt) => ({
            employeeId: dto.employeeId,
            loggedAt,
            deviceId: deviceLabel,
            source: "manual",
            createdBy: actorUserId,
          })),
        )
        .returning(),
    );

    const empName = formatEmployeeName(emp);

    return {
      insertedCount: inserted.length,
      skippedCount,
      records: inserted.map((row) => ({
        id: row.id,
        employeeId: row.employeeId,
        employeeName: empName,
        loggedAt: row.loggedAt.toISOString(),
        deviceId: row.deviceId,
        source: row.source as AttendanceLogSource,
        createdBy: row.createdBy,
        createdByName: null,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async generateImportTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Attendance Logs");

    sheet.columns = [
      { header: "Date", key: "date", width: 15 },
      { header: "Employee ID", key: "employeeId", width: 18 },
      { header: "AM Time In", key: "amIn", width: 14 },
      { header: "AM Time Out", key: "amOut", width: 14 },
      { header: "PM Time In", key: "pmIn", width: 14 },
      { header: "PM Time Out", key: "pmOut", width: 14 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.commit();

    sheet.addRow({
      date: "2026-10-05",
      employeeId: "EMP-20260001",
      amIn: "08:00",
      amOut: "12:00",
      pmIn: "13:00",
      pmOut: "17:00",
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async importSpreadsheetLogs(
    buffer: Buffer,
    filename: string,
    actorUserId: string,
  ): Promise<ImportLogsResult> {
    const lower = filename.toLowerCase();
    let rawRows: unknown[][] = [];

    if (lower.endsWith(".csv")) {
      rawRows = parseCsvLines(buffer.toString("utf-8"));
    } else if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      try {
        const workbook = new ExcelJS.Workbook();
        // biome-ignore lint/suspicious/noExplicitAny: ExcelJS buffer typing differs across @types/node versions
        await workbook.xlsx.load(buffer as any);
        const sheet = workbook.worksheets[0];
        if (!sheet) {
          throw new BadRequestException("Spreadsheet contains no worksheets");
        }
        sheet.eachRow((row) => {
          const vals = Array.isArray(row.values) ? row.values.slice(1) : [];
          if (vals.some((v) => v !== null && v !== undefined && String(v).trim() !== "")) {
            rawRows.push(vals);
          }
        });
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        throw new BadRequestException(
          "Unable to read spreadsheet. Please upload a valid .xlsx or .csv file based on the template.",
        );
      }
    } else {
      throw new BadRequestException("Unsupported file type. Upload a .xlsx, .xls, or .csv file.");
    }

    if (rawRows.length <= 1) {
      throw new BadRequestException("Spreadsheet contains no data rows after the header row.");
    }

    // Strip header row
    const dataRows = rawRows.slice(1);
    const errors: ImportLogsRowError[] = [];

    interface ParsedRow {
      rowNum: number;
      dateStr: string;
      employeeId: string;
      times: string[];
    }
    const parsedRows: ParsedRow[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const cells = dataRows[i] ?? [];
      const rowNum = i + 2; // 1-indexed including header

      const dateStr = coerceDateCell(cells[0]);
      const empId = cells[1] !== null && cells[1] !== undefined ? String(cells[1]).trim() : "";

      if (!dateStr) {
        errors.push({ row: rowNum, message: "Invalid or missing Date (expected YYYY-MM-DD)" });
        continue;
      }
      if (!empId) {
        errors.push({ row: rowNum, message: "Missing Employee ID" });
        continue;
      }

      const times: string[] = [];
      let badTime = false;
      const timeLabels = ["AM Time In", "AM Time Out", "PM Time In", "PM Time Out"];

      for (let col = 0; col < 4; col++) {
        const rawCell = cells[col + 2];
        if (rawCell === null || rawCell === undefined || String(rawCell).trim() === "") {
          continue;
        }
        const parsedTime = coerceTimeCell(rawCell);
        if (!parsedTime) {
          errors.push({
            row: rowNum,
            message: `Invalid ${timeLabels[col]} value "${String(rawCell)}"`,
          });
          badTime = true;
        } else {
          times.push(parsedTime);
        }
      }

      if (badTime) continue;

      if (times.length === 0) {
        errors.push({
          row: rowNum,
          message: "At least one punch time (AM/PM In or Out) is required",
        });
        continue;
      }

      parsedRows.push({ rowNum, dateStr, employeeId: empId, times });
    }

    // Verify all referenced employees exist upfront
    const distinctEmpIds = Array.from(new Set(parsedRows.map((r) => r.employeeId)));
    const existingEmps =
      distinctEmpIds.length > 0
        ? await this.db
            .select({ employeeId: employees.employeeId })
            .from(employees)
            .where(inArray(employees.employeeId, distinctEmpIds))
        : [];
    const existingEmpSet = new Set(existingEmps.map((e) => e.employeeId));

    for (const r of parsedRows) {
      if (!existingEmpSet.has(r.employeeId)) {
        errors.push({ row: r.rowNum, message: `Employee ID "${r.employeeId}" does not exist` });
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException({
        message: `Import aborted: ${errors.length} row validation error(s) found.`,
        errors,
      });
    }

    // Build timezone lookup for employees
    const tzByEmp = new Map<string, string>();
    for (const empId of distinctEmpIds) {
      tzByEmp.set(empId, await this.resolveEmployeeTimezone(empId));
    }

    // Deduplicate in-file (employeeId, loggedAt) pairs
    const candidateMap = new Map<string, { employeeId: string; loggedAt: Date }>();
    for (const r of parsedRows) {
      const tz = tzByEmp.get(r.employeeId) ?? DEFAULT_TZ;
      for (const t of r.times) {
        const dt = localDateTimeToUtcDate(r.dateStr, t, tz);
        const key = `${r.employeeId}|${dt.getTime()}`;
        if (!candidateMap.has(key)) {
          candidateMap.set(key, { employeeId: r.employeeId, loggedAt: dt });
        }
      }
    }

    const totalCandidates = candidateMap.size;
    const allDates = Array.from(candidateMap.values()).map((c) => c.loggedAt);

    const existingDbRows =
      distinctEmpIds.length > 0 && allDates.length > 0
        ? await this.db
            .select({ employeeId: employeeLogs.employeeId, loggedAt: employeeLogs.loggedAt })
            .from(employeeLogs)
            .where(
              and(
                inArray(employeeLogs.employeeId, distinctEmpIds),
                inArray(employeeLogs.loggedAt, allDates),
              ),
            )
        : [];
    const dbKeySet = new Set(existingDbRows.map((r) => `${r.employeeId}|${r.loggedAt.getTime()}`));

    const toInsert = Array.from(candidateMap.entries())
      .filter(([key]) => !dbKeySet.has(key))
      .map(([, val]) => ({
        employeeId: val.employeeId,
        loggedAt: val.loggedAt,
        deviceId: "EXCEL-UPLOAD",
        source: "excel_import",
        createdBy: actorUserId,
      }));

    if (toInsert.length > 0) {
      await this.db.transaction(async (tx) => {
        await tx.insert(employeeLogs).values(toInsert);
      });
    }

    return {
      totalRows: dataRows.length,
      insertedCount: toInsert.length,
      skippedCount: totalCandidates - toInsert.length,
    };
  }

  private async resolveEmployeeTimezone(employeeId: string, dateStr?: string): Promise<string> {
    const targetDate = dateStr ?? new Date().toISOString().slice(0, 10);
    const [row] = await this.db
      .select({ timezone: schedules.timezone })
      .from(employeeSchedules)
      .innerJoin(schedules, eq(employeeSchedules.scheduleId, schedules.id))
      .where(
        and(
          eq(employeeSchedules.employeeId, employeeId),
          lte(employeeSchedules.effectiveFrom, targetDate),
          or(isNull(employeeSchedules.effectiveTo), gte(employeeSchedules.effectiveTo, targetDate)),
        ),
      )
      .limit(1);

    return row?.timezone ?? DEFAULT_TZ;
  }
}
