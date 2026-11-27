import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  type BatchAssignScheduleDto,
  batchAssignScheduleSchema,
  type CreateScheduleDto,
  createScheduleSchema,
  type EmployeeScheduleRecord,
  employeeIdScheduleParamSchema,
  type ListEmployeeSchedulesQuery,
  type ListSchedulesQuery,
  listEmployeeSchedulesQuerySchema,
  listSchedulesQuerySchema,
  type PaginatedResponse,
  type ResolvedScheduleResponse,
  type ResolveScheduleQuery,
  resolveScheduleQuerySchema,
  type ScheduleRecord,
  scheduleIdParamSchema,
  type UpdateEmployeeScheduleDto,
  type UpdateScheduleDto,
  updateEmployeeScheduleSchema,
  updateScheduleSchema,
} from "@starter/shared";
import { type AuthenticatedFastifyRequest, SessionAuthGuard } from "../auth/auth.guard.js";
import { SchedulesService } from "./schedules.service.js";

@ApiTags("schedules")
@Controller("schedules")
@UseGuards(SessionAuthGuard)
export class SchedulesController {
  constructor(@Inject(SchedulesService) private readonly schedulesService: SchedulesService) {}

  @Get()
  @ApiOperation({ summary: "List weekly work schedule templates" })
  listSchedules(
    @Query({ schema: listSchedulesQuerySchema }) query: ListSchedulesQuery,
  ): Promise<PaginatedResponse<ScheduleRecord>> {
    return this.schedulesService.listSchedules(query);
  }

  @Get("assignments")
  @ApiOperation({ summary: "List employee schedule assignments" })
  listAssignments(
    @Query({ schema: listEmployeeSchedulesQuerySchema }) query: ListEmployeeSchedulesQuery,
  ): Promise<PaginatedResponse<EmployeeScheduleRecord>> {
    return this.schedulesService.listAssignments(query);
  }

  @Post("assignments/batch")
  @ApiOperation({ summary: "Atomically assign a schedule template to 1..100 employees" })
  batchAssign(
    @Body({ schema: batchAssignScheduleSchema }) body: BatchAssignScheduleDto,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<EmployeeScheduleRecord[]> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.schedulesService.batchAssign(body, request.authUser.id);
  }

  @Patch("assignments/:id")
  @ApiOperation({ summary: "Update effective_to on a current or future employee assignment" })
  updateAssignment(
    @Param({ schema: scheduleIdParamSchema }) params: { id: number },
    @Body({ schema: updateEmployeeScheduleSchema }) body: UpdateEmployeeScheduleDto,
  ): Promise<EmployeeScheduleRecord> {
    return this.schedulesService.updateAssignment(params.id, body);
  }

  @Delete("assignments/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a strictly future-dated employee schedule assignment" })
  deleteAssignment(
    @Param({ schema: scheduleIdParamSchema }) params: { id: number },
  ): Promise<void> {
    return this.schedulesService.deleteAssignment(params.id);
  }

  @Get("employees/:employeeId/resolve")
  @ApiOperation({ summary: "Resolve an employee's day-by-day working schedule up to 366 days" })
  resolveEmployeeSchedule(
    @Param({ schema: employeeIdScheduleParamSchema }) params: { employeeId: string },
    @Query({ schema: resolveScheduleQuerySchema }) query: ResolveScheduleQuery,
  ): Promise<ResolvedScheduleResponse> {
    return this.schedulesService.resolveEmployeeSchedule(params.employeeId, query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a schedule template with its 7-day shift slots" })
  getScheduleById(
    @Param({ schema: scheduleIdParamSchema }) params: { id: number },
  ): Promise<ScheduleRecord> {
    return this.schedulesService.getScheduleById(params.id);
  }

  @Post()
  @ApiOperation({ summary: "Create a new 7-day work schedule template" })
  createSchedule(
    @Body({ schema: createScheduleSchema }) body: CreateScheduleDto,
  ): Promise<ScheduleRecord> {
    return this.schedulesService.createSchedule(body);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update a schedule template (slots/timezone locked once assigned)" })
  updateSchedule(
    @Param({ schema: scheduleIdParamSchema }) params: { id: number },
    @Body({ schema: updateScheduleSchema }) body: UpdateScheduleDto,
  ): Promise<ScheduleRecord> {
    return this.schedulesService.updateSchedule(params.id, body);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete an unassigned work schedule template" })
  deleteSchedule(@Param({ schema: scheduleIdParamSchema }) params: { id: number }): Promise<void> {
    return this.schedulesService.deleteSchedule(params.id);
  }
}
