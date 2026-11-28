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
  type CreateOfficialBusinessApplicationDto,
  type CreateOfficialBusinessBatchResult,
  createOfficialBusinessApplicationSchema,
  type DecisionRemarksDto,
  decisionRemarksSchema,
  type ListOfficialBusinessApplicationsQuery,
  listOfficialBusinessApplicationsQuerySchema,
  type OfficialBusinessApplicationRecord,
  type OfficialBusinessFilingContext,
  type OfficialBusinessIdParam,
  officialBusinessIdParamSchema,
  type PaginatedResponse,
} from "@starter/shared";
import { type AuthenticatedFastifyRequest, SessionAuthGuard } from "../auth/auth.guard.js";
import { OfficialBusinessService } from "./official-business.service.js";

@ApiTags("official-business")
@Controller("official-business")
@UseGuards(SessionAuthGuard)
export class OfficialBusinessController {
  constructor(
    @Inject(OfficialBusinessService)
    private readonly officialBusinessService: OfficialBusinessService,
  ) {}

  @Get("context")
  @ApiOperation({ summary: "Get authoritative current employee profile for self-service filing" })
  getFilingContext(
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<OfficialBusinessFilingContext> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.officialBusinessService.getFilingContext(request.authUser);
  }

  @Get()
  @ApiOperation({ summary: "List Official Business & WFH applications scoped by role" })
  listApplications(
    @Query({ schema: listOfficialBusinessApplicationsQuerySchema })
    query: ListOfficialBusinessApplicationsQuery,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<PaginatedResponse<OfficialBusinessApplicationRecord>> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.officialBusinessService.listApplications(query, request.authUser);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get OB/WFH application detail with schedule rows and approvals" })
  getApplicationById(
    @Param({ schema: officialBusinessIdParamSchema }) params: OfficialBusinessIdParam,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<OfficialBusinessApplicationRecord> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.officialBusinessService.getApplicationById(params.id, request.authUser);
  }

  @Post()
  @ApiOperation({ summary: "Submit OB or WFH application (self or multi-employee admin batch)" })
  createApplications(
    @Body({ schema: createOfficialBusinessApplicationSchema })
    body: CreateOfficialBusinessApplicationDto,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<CreateOfficialBusinessBatchResult> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.officialBusinessService.createApplications(body, request.authUser);
  }

  @Post(":id/approve")
  @ApiOperation({ summary: "Approve the current pending step on the actor's turn" })
  approveApplication(
    @Param({ schema: officialBusinessIdParamSchema }) params: OfficialBusinessIdParam,
    @Body({ schema: decisionRemarksSchema }) body: DecisionRemarksDto,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<OfficialBusinessApplicationRecord> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.officialBusinessService.approveApplication(
      params.id,
      body.remarks,
      request.authUser,
    );
  }

  @Post(":id/disapprove")
  @ApiOperation({ summary: "Disapprove as turn approver or admin override (frees time windows)" })
  disapproveApplication(
    @Param({ schema: officialBusinessIdParamSchema }) params: OfficialBusinessIdParam,
    @Body({ schema: decisionRemarksSchema }) body: DecisionRemarksDto,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<OfficialBusinessApplicationRecord> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.officialBusinessService.disapproveApplication(
      params.id,
      body.remarks,
      request.authUser,
    );
  }

  @Post(":id/cancel")
  @ApiOperation({ summary: "Cancel own pending OB/WFH application (frees time windows)" })
  cancelApplication(
    @Param({ schema: officialBusinessIdParamSchema }) params: OfficialBusinessIdParam,
    @Body({ schema: decisionRemarksSchema }) body: DecisionRemarksDto,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<OfficialBusinessApplicationRecord> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.officialBusinessService.cancelApplication(
      params.id,
      body.remarks,
      request.authUser,
    );
  }
}
