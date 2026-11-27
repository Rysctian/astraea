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
  type CreateReferenceItemDto,
  createReferenceItemSchema,
  type ListReferenceItemsQuery,
  listReferenceItemsQuerySchema,
  type ReferenceGroupKey,
  type ReferenceOptionsQuery,
  referenceGroupItemParamSchema,
  referenceGroupParamSchema,
  referenceOptionsQuerySchema,
  type UpdateReferenceItemDto,
  updateReferenceItemSchema,
} from "@starter/shared";
import { ReferenceSetupService } from "./reference-setup.service.js";

@ApiTags("reference-setup")
@Controller("reference-setup")
export class ReferenceSetupController {
  constructor(@Inject(ReferenceSetupService) private readonly refService: ReferenceSetupService) {}

  @Get("options")
  @ApiOperation({ summary: "Get active-only reference items grouped by category" })
  getActiveOptions(@Query({ schema: referenceOptionsQuerySchema }) query: ReferenceOptionsQuery) {
    return this.refService.getActiveOptions(query);
  }

  @Get("groups/:group/categories")
  @ApiOperation({ summary: "Get categories and counts for a reference setup group" })
  getCategories(
    @Param({ schema: referenceGroupParamSchema }) params: { group: ReferenceGroupKey },
  ) {
    return this.refService.getCategories(params.group);
  }

  @Get("groups/:group/items")
  @ApiOperation({ summary: "List reference items for a category (server-paginated, usage-aware)" })
  listItems(
    @Param({ schema: referenceGroupParamSchema }) params: { group: ReferenceGroupKey },
    @Query({ schema: listReferenceItemsQuerySchema }) query: ListReferenceItemsQuery,
  ) {
    return this.refService.listItems(params.group, query);
  }

  @Post("groups/:group/items")
  @ApiOperation({ summary: "Create a reference item in the specified setup group" })
  create(
    @Param({ schema: referenceGroupParamSchema }) params: { group: ReferenceGroupKey },
    @Body({ schema: createReferenceItemSchema }) body: CreateReferenceItemDto,
  ) {
    return this.refService.create(params.group, body);
  }

  @Patch("groups/:group/items/:id")
  @ApiOperation({ summary: "Update a reference item in the specified setup group" })
  update(
    @Param({ schema: referenceGroupItemParamSchema })
    params: { group: ReferenceGroupKey; id: number },
    @Body({ schema: updateReferenceItemSchema }) body: UpdateReferenceItemDto,
  ) {
    return this.refService.update(params.group, params.id, body);
  }

  @Delete("groups/:group/items/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete an unused reference item" })
  remove(
    @Param({ schema: referenceGroupItemParamSchema })
    params: { group: ReferenceGroupKey; id: number },
  ) {
    return this.refService.remove(params.group, params.id);
  }
}
