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
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  type ListOrgQuery,
  listOrgQuerySchema,
  type OrgEntityType,
  type OrgTreeQuery,
  orgEntityIdParamSchema,
  orgEntityParamSchema,
  orgTreeQuerySchema,
} from "@starter/shared";
import { OrganizationService } from "./organization.service.js";

@ApiTags("organization")
@Controller("organization")
export class OrganizationController {
  constructor(@Inject(OrganizationService) private readonly orgService: OrganizationService) {}

  @Get("summary")
  @ApiOperation({ summary: "Get 6-entity organizational setup KPI counts" })
  getSummary() {
    return this.orgService.getSummary();
  }

  @Get("options")
  @ApiOperation({ summary: "Get active-only organizational options for downstream dropdowns" })
  getActiveOptions() {
    return this.orgService.getActiveOptions();
  }

  @Get("tree")
  @ApiOperation({ summary: "Get nested organizational hierarchy tree" })
  getTree(@Query({ schema: orgTreeQuerySchema }) query: OrgTreeQuery) {
    return this.orgService.getTree(query.includeInactive);
  }

  @Get(":entity")
  @ApiOperation({ summary: "List organizational entities (server-paginated, sortable, filtered)" })
  list(
    @Param({ schema: orgEntityParamSchema }) params: { entity: OrgEntityType },
    @Query({ schema: listOrgQuerySchema }) query: ListOrgQuery,
  ) {
    return this.orgService.list(params.entity, query);
  }

  @Post(":entity")
  @ApiOperation({ summary: "Create an organizational entity" })
  create(
    @Param({ schema: orgEntityParamSchema }) params: { entity: OrgEntityType },
    @Body() body: unknown,
  ) {
    return this.orgService.create(params.entity, body);
  }

  @Patch(":entity/:id")
  @ApiOperation({ summary: "Update an organizational entity with cycle and parent checks" })
  update(
    @Param({ schema: orgEntityIdParamSchema }) params: { entity: OrgEntityType; id: number },
    @Body() body: unknown,
  ) {
    return this.orgService.update(params.entity, params.id, body);
  }

  @Delete(":entity/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete an unused organizational entity" })
  remove(@Param({ schema: orgEntityIdParamSchema }) params: { entity: OrgEntityType; id: number }) {
    return this.orgService.remove(params.entity, params.id);
  }
}
