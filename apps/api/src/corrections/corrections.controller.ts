import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  type CorrectionApplicationRecord,
  type CorrectionFilingContext,
  type CorrectionIdParam,
  type CorrectionLogPreviewResponse,
  type CreateCorrectionApplicationDto,
  correctionIdParamSchema,
  createCorrectionApplicationSchema,
  type DecisionRemarksDto,
  decisionRemarksSchema,
  type ListCorrectionApplicationsQuery,
  listCorrectionApplicationsQuerySchema,
  type PaginatedResponse,
  type PreviewCorrectionLogsQuery,
  previewCorrectionLogsQuerySchema,
} from "@starter/shared";
import { type AuthenticatedFastifyRequest, SessionAuthGuard } from "../auth/auth.guard.js";
import { CorrectionsService } from "./corrections.service.js";

@ApiTags("corrections")
@Controller("corrections")
@UseGuards(SessionAuthGuard)
export class CorrectionsController {
  constructor(
    @Inject(CorrectionsService) private readonly correctionsService: CorrectionsService,
  ) {}

  @Get("context")
  @ApiOperation({ summary: "Get authoritative current employee profile for self-service filing" })
  getFilingContext(@Req() request: AuthenticatedFastifyRequest): Promise<CorrectionFilingContext> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.correctionsService.getFilingContext(request.authUser);
  }

  @Get("preview")
  @ApiOperation({
    summary: "Preview recorded raw attendance logs and 4-slot AM/PM pairing for a date",
  })
  previewDateLogs(
    @Query({ schema: previewCorrectionLogsQuerySchema }) query: PreviewCorrectionLogsQuery,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<CorrectionLogPreviewResponse> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.correctionsService.previewDateLogs(query, request.authUser);
  }

  @Get()
  @ApiOperation({ summary: "List attendance correction applications scoped by role" })
  listApplications(
    @Query({ schema: listCorrectionApplicationsQuerySchema })
    query: ListCorrectionApplicationsQuery,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<PaginatedResponse<CorrectionApplicationRecord>> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.correctionsService.listApplications(query, request.authUser);
  }

  @Get(":id")
  @ApiOperation({
    summary: "Get correction application detail with Old vs New comparison and approvals",
  })
  getApplicationById(
    @Param({ schema: correctionIdParamSchema }) params: CorrectionIdParam,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<CorrectionApplicationRecord> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.correctionsService.getApplicationById(params.id, request.authUser);
  }

  @Post()
  @ApiOperation({ summary: "Submit single-employee attendance correction application" })
  createApplication(
    @Body({ schema: createCorrectionApplicationSchema }) body: CreateCorrectionApplicationDto,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<CorrectionApplicationRecord> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.correctionsService.createApplication(body, request.authUser);
  }

  @Post(":id/approve")
  @ApiOperation({ summary: "Approve step on turn; syncs employee_logs on final approval" })
  approveApplication(
    @Param({ schema: correctionIdParamSchema }) params: CorrectionIdParam,
    @Body({ schema: decisionRemarksSchema }) body: DecisionRemarksDto,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<CorrectionApplicationRecord> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.correctionsService.approveApplication(params.id, body.remarks, request.authUser);
  }

  @Post(":id/disapprove")
  @ApiOperation({
    summary: "Disapprove on turn or admin override (removes synced logs if approved)",
  })
  disapproveApplication(
    @Param({ schema: correctionIdParamSchema }) params: CorrectionIdParam,
    @Body({ schema: decisionRemarksSchema }) body: DecisionRemarksDto,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<CorrectionApplicationRecord> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.correctionsService.disapproveApplication(params.id, body.remarks, request.authUser);
  }

  @Post(":id/cancel")
  @ApiOperation({
    summary: "Cancel own pending correction application (frees date without log edits)",
  })
  cancelApplication(
    @Param({ schema: correctionIdParamSchema }) params: CorrectionIdParam,
    @Body({ schema: decisionRemarksSchema }) body: DecisionRemarksDto,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<CorrectionApplicationRecord> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.correctionsService.cancelApplication(params.id, body.remarks, request.authUser);
  }
}
