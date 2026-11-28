import {
  BadRequestException,
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
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  type BulkAllocateCreditsResult,
  type BulkAllocateLeaveCreditsDto,
  bulkAllocateLeaveCreditsSchema,
  type CreateLeavePolicyDto,
  type CreateLeaveTypeDto,
  createLeaveApplicationSchema,
  createLeavePolicySchema,
  createLeaveTypeSchema,
  type DecisionRemarksDto,
  decisionRemarksSchema,
  type EmployeeLeaveCreditRecord,
  type LeaveApplicationRecord,
  type LeaveCreditLogRecord,
  type LeaveFilingOptionsResponse,
  type LeaveIdParam,
  type LeavePolicyRecord,
  type LeaveTypeRecord,
  type ListLeaveApplicationsQuery,
  type ListLeaveCreditsQuery,
  type ListLeavePoliciesQuery,
  type ListLeaveTypesQuery,
  leaveIdParamSchema,
  listLeaveApplicationsQuerySchema,
  listLeaveCreditsQuerySchema,
  listLeavePoliciesQuerySchema,
  listLeaveTypesQuerySchema,
  type MyLeaveCreditsQuery,
  myLeaveCreditsQuerySchema,
  type PaginatedResponse,
  type UpdateLeavePolicyDto,
  type UpdateLeaveTypeDto,
  type UpsertLeaveCreditDto,
  updateLeavePolicySchema,
  updateLeaveTypeSchema,
  upsertLeaveCreditSchema,
} from "@starter/shared";
import type { FastifyReply } from "fastify";
import { type AuthenticatedFastifyRequest, SessionAuthGuard } from "../auth/auth.guard.js";
import { LeaveService } from "./leave.service.js";
import type { UploadedAttachmentInput } from "./leave-storage.js";

@ApiTags("leave")
@Controller("leave")
@UseGuards(SessionAuthGuard)
export class LeaveController {
  constructor(@Inject(LeaveService) private readonly leaveService: LeaveService) {}

  // --- Filing Options & Self Balances ---

  @Get("options")
  @ApiOperation({ summary: "Get active leave types with resolved policies and current employee" })
  getFilingOptions(
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<LeaveFilingOptionsResponse> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.leaveService.getFilingOptions(request.authUser);
  }

  @Get("credits/my")
  @ApiOperation({ summary: "Get signed-in employee annual leave credit balances" })
  getMyCredits(
    @Query({ schema: myLeaveCreditsQuerySchema }) query: MyLeaveCreditsQuery,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<EmployeeLeaveCreditRecord[]> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.leaveService.getMyCredits(query.year, request.authUser);
  }

  // --- Leave Policies (Admin) ---

  @Get("policies")
  @ApiOperation({ summary: "List leave policies (admin)" })
  listPolicies(
    @Query({ schema: listLeavePoliciesQuerySchema }) query: ListLeavePoliciesQuery,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<PaginatedResponse<LeavePolicyRecord>> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.leaveService.listPolicies(query, request.authUser);
  }

  @Post("policies")
  @ApiOperation({ summary: "Create a leave policy (admin)" })
  createPolicy(
    @Body({ schema: createLeavePolicySchema }) body: CreateLeavePolicyDto,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<LeavePolicyRecord> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.leaveService.createPolicy(body, request.authUser);
  }

  @Patch("policies/:id")
  @ApiOperation({ summary: "Update a leave policy (admin)" })
  updatePolicy(
    @Param({ schema: leaveIdParamSchema }) params: LeaveIdParam,
    @Body({ schema: updateLeavePolicySchema }) body: UpdateLeavePolicyDto,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<LeavePolicyRecord> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.leaveService.updatePolicy(params.id, body, request.authUser);
  }

  @Delete("policies/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete an unused non-default leave policy (admin)" })
  deletePolicy(
    @Param({ schema: leaveIdParamSchema }) params: LeaveIdParam,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<void> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.leaveService.deletePolicy(params.id, request.authUser);
  }

  // --- Leave Types (Admin) ---

  @Get("types")
  @ApiOperation({ summary: "List leave types (admin)" })
  listLeaveTypes(
    @Query({ schema: listLeaveTypesQuerySchema }) query: ListLeaveTypesQuery,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<PaginatedResponse<LeaveTypeRecord>> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.leaveService.listLeaveTypes(query, request.authUser);
  }

  @Post("types")
  @ApiOperation({ summary: "Create a leave type (admin)" })
  createLeaveType(
    @Body({ schema: createLeaveTypeSchema }) body: CreateLeaveTypeDto,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<LeaveTypeRecord> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.leaveService.createLeaveType(body, request.authUser);
  }

  @Patch("types/:id")
  @ApiOperation({ summary: "Update a leave type (admin)" })
  updateLeaveType(
    @Param({ schema: leaveIdParamSchema }) params: LeaveIdParam,
    @Body({ schema: updateLeaveTypeSchema }) body: UpdateLeaveTypeDto,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<LeaveTypeRecord> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.leaveService.updateLeaveType(params.id, body, request.authUser);
  }

  @Delete("types/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete an unreferenced leave type (admin)" })
  deleteLeaveType(
    @Param({ schema: leaveIdParamSchema }) params: LeaveIdParam,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<void> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.leaveService.deleteLeaveType(params.id, request.authUser);
  }

  // --- Employee Credits & Audit Ledger ---

  @Get("credits")
  @ApiOperation({ summary: "List employee annual leave credit balances (admin)" })
  listCredits(
    @Query({ schema: listLeaveCreditsQuerySchema }) query: ListLeaveCreditsQuery,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<PaginatedResponse<EmployeeLeaveCreditRecord>> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.leaveService.listCredits(query, request.authUser);
  }

  @Post("credits")
  @ApiOperation({ summary: "Upsert or adjust an employee annual leave credit balance (admin)" })
  upsertCredit(
    @Body({ schema: upsertLeaveCreditSchema }) body: UpsertLeaveCreditDto,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<EmployeeLeaveCreditRecord> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.leaveService.upsertCredit(body, request.authUser);
  }

  @Post("credits/bulk")
  @ApiOperation({ summary: "Bulk allocate annual leave credits across employees (admin)" })
  bulkAllocateCredits(
    @Body({ schema: bulkAllocateLeaveCreditsSchema }) body: BulkAllocateLeaveCreditsDto,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<BulkAllocateCreditsResult> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.leaveService.bulkAllocateCredits(body, request.authUser);
  }

  @Get("credits/:id/logs")
  @ApiOperation({ summary: "Get append-only audit ledger for an employee leave credit row" })
  getCreditLogs(
    @Param({ schema: leaveIdParamSchema }) params: LeaveIdParam,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<LeaveCreditLogRecord[]> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.leaveService.getCreditLogs(params.id, request.authUser);
  }

  // --- Leave Applications ---

  @Get("applications")
  @ApiOperation({ summary: "List leave applications scoped by role and approval participation" })
  listApplications(
    @Query({ schema: listLeaveApplicationsQuerySchema }) query: ListLeaveApplicationsQuery,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<PaginatedResponse<LeaveApplicationRecord>> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.leaveService.listApplications(query, request.authUser);
  }

  @Get("applications/:id")
  @ApiOperation({ summary: "Get leave application detail with date rows and approval timeline" })
  getApplicationById(
    @Param({ schema: leaveIdParamSchema }) params: LeaveIdParam,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<LeaveApplicationRecord> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.leaveService.getApplicationById(params.id, request.authUser);
  }

  @Get("applications/:id/attachment")
  @ApiOperation({
    summary: "Download private supporting attachment for an authorized leave request",
  })
  async downloadAttachment(
    @Param({ schema: leaveIdParamSchema }) params: LeaveIdParam,
    @Req() request: AuthenticatedFastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    const { buffer, mimeType, filename } = await this.leaveService.getAttachmentDownload(
      params.id,
      request.authUser,
    );
    const safeName = filename.replace(/["\r\n]/g, "_");
    reply
      .header("Content-Type", mimeType)
      .header("Content-Disposition", `attachment; filename="${safeName}"`)
      .send(buffer);
  }

  @Post("applications")
  @ApiOperation({
    summary: "Submit a single-employee leave application (JSON or multipart with optional file)",
  })
  async createApplication(
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<LeaveApplicationRecord> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }

    let rawPayload: unknown;
    let uploadedFile: UploadedAttachmentInput | null = null;

    if (request.isMultipart()) {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === "file") {
          const buffer = await part.toBuffer();
          if (buffer.byteLength > 0) {
            uploadedFile = { buffer, filename: part.filename };
          }
        } else if (part.fieldname === "payload") {
          try {
            rawPayload = JSON.parse(String(part.value));
          } catch {
            throw new BadRequestException("Invalid JSON payload in multipart leave submission");
          }
        }
      }
    } else {
      rawPayload = request.body;
    }

    const parsed = createLeaveApplicationSchema.safeParse(rawPayload);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((i) => i.message).join("; ") || "Invalid leave application payload",
      );
    }

    return this.leaveService.createApplication(parsed.data, uploadedFile, request.authUser);
  }

  @Post("applications/:id/approve")
  @ApiOperation({
    summary: "Approve the current pending step and deduct credits on final approval",
  })
  approveApplication(
    @Param({ schema: leaveIdParamSchema }) params: LeaveIdParam,
    @Body({ schema: decisionRemarksSchema }) body: DecisionRemarksDto,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<LeaveApplicationRecord> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.leaveService.approveApplication(params.id, body.remarks, request.authUser);
  }

  @Post("applications/:id/disapprove")
  @ApiOperation({
    summary: "Disapprove as turn approver or admin override (releases/restores credits)",
  })
  disapproveApplication(
    @Param({ schema: leaveIdParamSchema }) params: LeaveIdParam,
    @Body({ schema: decisionRemarksSchema }) body: DecisionRemarksDto,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<LeaveApplicationRecord> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.leaveService.disapproveApplication(params.id, body.remarks, request.authUser);
  }

  @Post("applications/:id/cancel")
  @ApiOperation({ summary: "Cancel own pending leave application and release reserved credits" })
  cancelApplication(
    @Param({ schema: leaveIdParamSchema }) params: LeaveIdParam,
    @Body({ schema: decisionRemarksSchema }) body: DecisionRemarksDto,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<LeaveApplicationRecord> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.leaveService.cancelApplication(params.id, body.remarks, request.authUser);
  }
}
