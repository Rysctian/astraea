import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  type CreateEmployeeDto,
  createEmployeeSchema,
  type EmployeeIdParam,
  employeeIdParamSchema,
  type ListEmployeesQuery,
  listEmployeesQuerySchema,
  type UpdateEmployeeDto,
  updateEmployeeSchema,
} from "@starter/shared";
import { EmployeesService } from "./employees.service.js";

@ApiTags("employees")
@Controller("employees")
export class EmployeesController {
  constructor(@Inject(EmployeesService) private readonly employeesService: EmployeesService) {}

  @Get()
  @ApiOperation({
    summary: "List Employee 201 directory (server-side paginated, sorted, filtered)",
  })
  findAll(@Query({ schema: listEmployeesQuerySchema }) query: ListEmployeesQuery) {
    return this.employeesService.findAll(query);
  }

  @Get(":employeeId")
  @ApiOperation({ summary: "Get Employee 201 profile by EMP-YYYYNNNN business key" })
  findOne(@Param({ schema: employeeIdParamSchema }) params: EmployeeIdParam) {
    return this.employeesService.findOne(params.employeeId);
  }

  @Post()
  @ApiOperation({ summary: "Onboard an employee and atomically provision linked user account" })
  create(@Body({ schema: createEmployeeSchema }) body: CreateEmployeeDto) {
    return this.employeesService.create(body);
  }

  @Patch(":employeeId")
  @ApiOperation({ summary: "Update Employee 201 profile and sync linked user account" })
  update(
    @Param({ schema: employeeIdParamSchema }) params: EmployeeIdParam,
    @Body({ schema: updateEmployeeSchema }) body: UpdateEmployeeDto,
  ) {
    return this.employeesService.update(params.employeeId, body);
  }
}
