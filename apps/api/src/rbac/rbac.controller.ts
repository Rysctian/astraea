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
  type AssignUserRoleDto,
  assignUserRoleSchema,
  type CreateRoleDto,
  type CurrentUserAccessResponse,
  createRoleSchema,
  type ListRolesQuery,
  listRolesQuerySchema,
  type MenuCatalogGroup,
  type PaginatedResponse,
  type RoleDetailRecord,
  type RoleOptionItem,
  type RoleRecord,
  roleIdParamSchema,
  type UpdateRoleDto,
  type User,
  type UserIdParam,
  updateRoleSchema,
  userIdParamSchema,
} from "@starter/shared";
import { type AuthenticatedFastifyRequest, SessionAuthGuard } from "../auth/auth.guard.js";
import { RbacService } from "./rbac.service.js";

@ApiTags("rbac")
@Controller("rbac")
@UseGuards(SessionAuthGuard)
export class RbacController {
  constructor(@Inject(RbacService) private readonly rbacService: RbacService) {}

  @Get("me")
  @ApiOperation({ summary: "Get current authenticated user's role, permissions, and menu tree" })
  getMyAccess(@Req() request: AuthenticatedFastifyRequest): Promise<CurrentUserAccessResponse> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.rbacService.getCurrentUserAccess(request.authUser.id);
  }

  @Get("menus")
  @ApiOperation({ summary: "Get active leaf menus grouped by section for permission matrix" })
  getMenuCatalog(): Promise<MenuCatalogGroup[]> {
    return this.rbacService.getMenuCatalog();
  }

  @Get("roles")
  @ApiOperation({ summary: "List RBAC roles with server-side filters and pagination" })
  listRoles(
    @Query({ schema: listRolesQuerySchema }) query: ListRolesQuery,
  ): Promise<PaginatedResponse<RoleRecord>> {
    return this.rbacService.listRoles(query);
  }

  @Get("roles/options")
  @ApiOperation({ summary: "Get role dropdown options for inline user role assignment" })
  getRoleOptions(): Promise<RoleOptionItem[]> {
    return this.rbacService.getRoleOptions();
  }

  @Get("roles/:id")
  @ApiOperation({ summary: "Get a role and its per-menu CRUD permission grants" })
  getRoleById(
    @Param({ schema: roleIdParamSchema }) params: { id: number },
  ): Promise<RoleDetailRecord> {
    return this.rbacService.getRoleById(params.id);
  }

  @Post("roles")
  @ApiOperation({ summary: "Create a role and its initial permission matrix atomically" })
  createRole(@Body({ schema: createRoleSchema }) body: CreateRoleDto): Promise<RoleDetailRecord> {
    return this.rbacService.createRole(body);
  }

  @Patch("roles/:id")
  @ApiOperation({ summary: "Rename a role and atomically replace its permission matrix" })
  updateRole(
    @Param({ schema: roleIdParamSchema }) params: { id: number },
    @Body({ schema: updateRoleSchema }) body: UpdateRoleDto,
  ): Promise<RoleDetailRecord> {
    return this.rbacService.updateRole(params.id, body);
  }

  @Delete("roles/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete an unused custom role" })
  deleteRole(@Param({ schema: roleIdParamSchema }) params: { id: number }): Promise<void> {
    return this.rbacService.deleteRole(params.id);
  }

  @Patch("users/:id/role")
  @ApiOperation({ summary: "Assign a role to a user account" })
  assignUserRole(
    @Param({ schema: userIdParamSchema }) params: UserIdParam,
    @Body({ schema: assignUserRoleSchema }) body: AssignUserRoleDto,
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<User> {
    if (!request.authUser) {
      throw new UnauthorizedException("Authenticated user missing from request");
    }
    return this.rbacService.assignUserRole(params.id, body, request.authUser.id);
  }
}
