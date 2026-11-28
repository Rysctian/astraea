import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  type AttendanceLogRecord,
  type CreateManualLogDto,
  createManualLogSchema,
  type DtrQuery,
  type DtrResponse,
  dtrQuerySchema,
  type ImportLogsResult,
  type ListAttendanceLogsQuery,
  listAttendanceLogsQuerySchema,
  type ManualLogResult,
  type PaginatedResponse,
} from "@starter/shared";
import type { FastifyReply } from "fastify";
import { type AuthenticatedFastifyRequest, SessionAuthGuard } from "../auth/auth.guard.js";
import { AttendanceService } from "./attendance.service.js";

@ApiTags("attendance")
@Controller("attendance")
@UseGuards(SessionAuthGuard)
export class AttendanceController {
  constructor(@Inject(AttendanceService) private readonly attendanceService: AttendanceService) {}

  @Get("dtr")
  @ApiOperation({ summary: "Compute on-the-fly per-slot Daily Time Record (DTR) for an employee" })
  getDtr(@Query({ schema: dtrQuerySchema }) query: DtrQuery): Promise<DtrResponse> {
    return this.attendanceService.getDtr(query);
  }

  @Get("logs")
  @ApiOperation({ summary: "List raw employee attendance punch logs (server-side paginated)" })
  listLogs(
    @Query({ schema: listAttendanceLogsQuerySchema }) query: ListAttendanceLogsQuery,
  ): Promise<PaginatedResponse<AttendanceLogRecord>> {
    return this.attendanceService.listLogs(query);
  }

  @Post("logs/manual")
  @ApiOperation({ summary: "Record manual single or paired AM/PM attendance punches" })
  createManualLogs(
    @Body({ schema: createManualLogSchema }) body: CreateManualLogDto,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<ManualLogResult> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.attendanceService.createManualLogs(body, request.authUser.id);
  }

  @Get("logs/template")
  @ApiOperation({ summary: "Download standard Excel (.xlsx) attendance log import template" })
  async downloadTemplate(@Res() reply: FastifyReply): Promise<void> {
    const buffer = await this.attendanceService.generateImportTemplate();
    reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", 'attachment; filename="attendance-logs-template.xlsx"')
      .send(buffer);
  }

  @Post("logs/import")
  @ApiOperation({ summary: "Atomically validate and import attendance logs (.xlsx, .xls, .csv)" })
  async importLogs(@Req() request: AuthenticatedFastifyRequest): Promise<ImportLogsResult> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }

    const file = await request.file();
    if (!file) {
      throw new BadRequestException("No spreadsheet file uploaded");
    }

    const buffer = await file.toBuffer();
    if (buffer.byteLength === 0) {
      throw new BadRequestException("Uploaded file is empty");
    }
    if (buffer.byteLength > 10 * 1024 * 1024) {
      throw new BadRequestException("Uploaded file exceeds the 10 MB limit");
    }

    return this.attendanceService.importSpreadsheetLogs(buffer, file.filename, request.authUser.id);
  }
}
