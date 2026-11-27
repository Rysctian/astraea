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
  type CreateCutOffDto,
  type CutOffPresetItem,
  type CutOffPresetsQuery,
  type CutOffRecord,
  createCutOffSchema,
  cutOffIdParamSchema,
  cutOffPresetsQuerySchema,
  type ListCutOffsQuery,
  listCutOffsQuerySchema,
  type PaginatedResponse,
  type UpdateCutOffDto,
  updateCutOffSchema,
} from "@starter/shared";
import { SessionAuthGuard } from "../auth/auth.guard.js";
import { CutOffsService } from "./cut-offs.service.js";

@ApiTags("cut-offs")
@Controller("cut-offs")
@UseGuards(SessionAuthGuard)
export class CutOffsController {
  constructor(@Inject(CutOffsService) private readonly cutOffsService: CutOffsService) {}

  @Get()
  @ApiOperation({ summary: "List cut-off definitions with nested periods and server-side filters" })
  list(
    @Query({ schema: listCutOffsQuerySchema }) query: ListCutOffsQuery,
  ): Promise<PaginatedResponse<CutOffRecord>> {
    return this.cutOffsService.list(query);
  }

  @Get("presets")
  @ApiOperation({ summary: "Get active cut-off DTR date-range presets for Attendance viewers" })
  getPresets(
    @Query({ schema: cutOffPresetsQuerySchema }) query: CutOffPresetsQuery,
  ): Promise<CutOffPresetItem[]> {
    return this.cutOffsService.getActivePresets(query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a single cut-off definition and its periods" })
  getById(@Param({ schema: cutOffIdParamSchema }) params: { id: number }): Promise<CutOffRecord> {
    return this.cutOffsService.getById(params.id);
  }

  @Post()
  @ApiOperation({ summary: "Create a monthly or semi-monthly cut-off with its periods" })
  create(@Body({ schema: createCutOffSchema }) body: CreateCutOffDto): Promise<CutOffRecord> {
    return this.cutOffsService.create(body);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update a cut-off definition and upsert its periods atomically" })
  update(
    @Param({ schema: cutOffIdParamSchema }) params: { id: number },
    @Body({ schema: updateCutOffSchema }) body: UpdateCutOffDto,
  ): Promise<CutOffRecord> {
    return this.cutOffsService.update(params.id, body);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Permanently delete a cut-off and cascade to its child periods" })
  remove(@Param({ schema: cutOffIdParamSchema }) params: { id: number }): Promise<void> {
    return this.cutOffsService.remove(params.id);
  }
}
