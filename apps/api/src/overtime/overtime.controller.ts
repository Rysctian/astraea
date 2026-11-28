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
  type CreateOvertimeApplicationDto,
  type CreateOvertimeBatchResult,
  createOvertimeApplicationSchema,
  type DecisionRemarksDto,
  decisionRemarksSchema,
  type ListOvertimeApplicationsQuery,
  listOvertimeApplicationsQuerySchema,
  type OvertimeApplicationIdParam,
  type OvertimeApplicationRecord,
  overtimeApplicationIdParamSchema,
  type PaginatedResponse,
} from "@starter/shared";
import { type AuthenticatedFastifyRequest, SessionAuthGuard } from "../auth/auth.guard.js";
import { OvertimeService } from "./overtime.service.js";

@ApiTags("overtime")
@Controller("overtime")
@UseGuards(SessionAuthGuard)
export class OvertimeController {
  constructor(@Inject(OvertimeService) private readonly overtimeService: OvertimeService) {}

  @Get()
  @ApiOperation({ summary: "List overtime applications scoped by role and approval participation" })
  listApplications(
    @Query({ schema: listOvertimeApplicationsQuerySchema }) query: ListOvertimeApplicationsQuery,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<PaginatedResponse<OvertimeApplicationRecord>> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.overtimeService.listApplications(query, request.authUser);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get overtime application detail with slots and approval pipeline" })
  getApplicationById(
    @Param({ schema: overtimeApplicationIdParamSchema }) params: OvertimeApplicationIdParam,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<OvertimeApplicationRecord> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.overtimeService.getApplicationById(params.id, request.authUser);
  }

  @Post()
  @ApiOperation({ summary: "Submit overtime application (self or multi-employee admin batch)" })
  createApplications(
    @Body({ schema: createOvertimeApplicationSchema }) body: CreateOvertimeApplicationDto,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<CreateOvertimeBatchResult> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.overtimeService.createApplications(body, request.authUser);
  }

  @Post(":id/approve")
  @ApiOperation({ summary: "Approve the current pending step when it is the actor's turn" })
  approveApplication(
    @Param({ schema: overtimeApplicationIdParamSchema }) params: OvertimeApplicationIdParam,
    @Body({ schema: decisionRemarksSchema }) body: DecisionRemarksDto,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<OvertimeApplicationRecord> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.overtimeService.approveApplication(params.id, body.remarks, request.authUser);
  }

  @Post(":id/disapprove")
  @ApiOperation({ summary: "Disapprove as current approver or via administrator override" })
  disapproveApplication(
    @Param({ schema: overtimeApplicationIdParamSchema }) params: OvertimeApplicationIdParam,
    @Body({ schema: decisionRemarksSchema }) body: DecisionRemarksDto,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<OvertimeApplicationRecord> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.overtimeService.disapproveApplication(params.id, body.remarks, request.authUser);
  }

  @Post(":id/cancel")
  @ApiOperation({ summary: "Cancel a pending overtime application (applicant only)" })
  cancelApplication(
    @Param({ schema: overtimeApplicationIdParamSchema }) params: OvertimeApplicationIdParam,
    @Body({ schema: decisionRemarksSchema }) body: DecisionRemarksDto,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<OvertimeApplicationRecord> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.overtimeService.cancelApplication(params.id, body.remarks, request.authUser);
  }
}
