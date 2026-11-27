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
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  type AttendancePolicyOptionsResponse,
  type AttendancePolicyRecord,
  attendancePolicyIdParamSchema,
  type CreateAttendancePolicyDto,
  createAttendancePolicySchema,
  type ListAttendancePoliciesQuery,
  listAttendancePoliciesQuerySchema,
  type PaginatedResponse,
  type UpdateAttendancePolicyDto,
  updateAttendancePolicySchema,
} from "@starter/shared";
import { SessionAuthGuard } from "../auth/auth.guard.js";
import { AttendancePoliciesService } from "./attendance-policies.service.js";

@ApiTags("attendance-policies")
@Controller("attendance-policies")
@UseGuards(SessionAuthGuard)
export class AttendancePoliciesController {
  constructor(
    @Inject(AttendancePoliciesService)
    private readonly policiesService: AttendancePoliciesService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List attendance policies with server-side filters and pagination" })
  list(
    @Query({ schema: listAttendancePoliciesQuerySchema }) query: ListAttendancePoliciesQuery,
  ): Promise<PaginatedResponse<AttendancePolicyRecord>> {
    return this.policiesService.list(query);
  }

  @Get("options")
  @ApiOperation({ summary: "Get active attendance policy options for schedule selectors" })
  getOptions(): Promise<AttendancePolicyOptionsResponse> {
    return this.policiesService.getOptions();
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a single attendance policy by ID" })
  getById(
    @Param({ schema: attendancePolicyIdParamSchema }) params: { id: number },
  ): Promise<AttendancePolicyRecord> {
    return this.policiesService.getById(params.id);
  }

  @Post()
  @ApiOperation({ summary: "Create a new attendance policy" })
  create(
    @Body({ schema: createAttendancePolicySchema }) body: CreateAttendancePolicyDto,
  ): Promise<AttendancePolicyRecord> {
    return this.policiesService.create(body);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update an attendance policy" })
  update(
    @Param({ schema: attendancePolicyIdParamSchema }) params: { id: number },
    @Body({ schema: updateAttendancePolicySchema }) body: UpdateAttendancePolicyDto,
  ): Promise<AttendancePolicyRecord> {
    return this.policiesService.update(params.id, body);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete an unused non-default attendance policy" })
  remove(@Param({ schema: attendancePolicyIdParamSchema }) params: { id: number }): Promise<void> {
    return this.policiesService.remove(params.id);
  }
}
