import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
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
  type ApproverWorkflowGroupRecord,
  type ApproverWorkflowKeyParam,
  approverWorkflowKeyParamSchema,
  type ListApproverWorkflowsQuery,
  listApproverWorkflowsQuerySchema,
  type PaginatedResponse,
  type SaveApproverWorkflowDto,
  type SaveApproverWorkflowResult,
  saveApproverWorkflowSchema,
} from "@starter/shared";
import { type AuthenticatedFastifyRequest, SessionAuthGuard } from "../auth/auth.guard.js";
import { RbacService } from "../rbac/rbac.service.js";
import { ApproverSetupService } from "./approver-setup.service.js";

@ApiTags("approver-setup")
@Controller("approver-setup")
@UseGuards(SessionAuthGuard)
export class ApproverSetupController {
  constructor(
    @Inject(ApproverSetupService) private readonly approverSetupService: ApproverSetupService,
    @Inject(RbacService) private readonly rbacService: RbacService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List grouped employee approval chains with pagination and filters" })
  async listWorkflows(
    @Query({ schema: listApproverWorkflowsQuerySchema }) query: ListApproverWorkflowsQuery,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<PaginatedResponse<ApproverWorkflowGroupRecord>> {
    await this.assertPermission(request, "canView");
    return this.approverSetupService.listWorkflows(query);
  }

  @Get(":employeeId/:applicationType")
  @ApiOperation({ summary: "Get one employee's approval chain for a specific application type" })
  async getWorkflow(
    @Param({ schema: approverWorkflowKeyParamSchema }) params: ApproverWorkflowKeyParam,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<ApproverWorkflowGroupRecord> {
    await this.assertPermission(request, "canView");
    return this.approverSetupService.getWorkflow(params.employeeId, params.applicationType);
  }

  @Post()
  @ApiOperation({ summary: "Atomically create or replace approval chains for 1..500 employees" })
  async saveWorkflows(
    @Body({ schema: saveApproverWorkflowSchema }) body: SaveApproverWorkflowDto,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<SaveApproverWorkflowResult> {
    const userId = await this.assertPermission(request, "canUpdate");
    return this.approverSetupService.saveWorkflows(body, userId);
  }

  @Delete(":employeeId/:applicationType")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete an approval chain template (preserves historical snapshots)" })
  async deleteWorkflow(
    @Param({ schema: approverWorkflowKeyParamSchema }) params: ApproverWorkflowKeyParam,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<void> {
    await this.assertPermission(request, "canDelete");
    await this.approverSetupService.deleteWorkflow(params.employeeId, params.applicationType);
  }

  private async assertPermission(
    request: AuthenticatedFastifyRequest,
    flag: "canView" | "canCreate" | "canUpdate" | "canDelete",
  ): Promise<string> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    const authority = await this.rbacService.getActorAuthority(request.authUser.id);
    const grant = authority.permissions.approver_setup;
    if (authority.roleCode === "admin") {
      return request.authUser.id;
    }
    if (!grant?.[flag]) {
      throw new ForbiddenException("You do not have permission to manage Approver Setup");
    }
    return request.authUser.id;
  }
}
