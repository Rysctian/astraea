import "reflect-metadata";
import { NotFoundException, StandardSchemaValidationPipe } from "@nestjs/common";
import { APP_FILTER, APP_PIPE } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import type {
  CreateEmployeeDto,
  Employee,
  EmployeeDetail,
  ListEmployeesQuery,
  PaginatedResponse,
  UpdateEmployeeDto,
} from "@starter/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HttpExceptionFilter } from "../common/filters/http-exception.filter.js";
import { EmployeesController } from "./employees.controller.js";
import { EmployeesService } from "./employees.service.js";

describe("Employees 201 HTTP pipeline", () => {
  let app: NestFastifyApplication;
  const store = new Map<string, EmployeeDetail>();
  let seq = 0;

  const stubEmployeesService = {
    async findAll(query: ListEmployeesQuery): Promise<PaginatedResponse<Employee>> {
      const all = [...store.values()].map((d) => d.employee);
      return {
        data: all,
        meta: {
          page: query.page,
          pageSize: query.pageSize,
          total: all.length,
          totalPages: Math.max(1, Math.ceil(all.length / query.pageSize)),
        },
      };
    },
    async findOne(employeeId: string): Promise<EmployeeDetail> {
      const detail = store.get(employeeId);
      if (!detail) {
        throw new NotFoundException(`Employee ${employeeId} not found`);
      }
      return detail;
    },
    async create(dto: CreateEmployeeDto): Promise<EmployeeDetail> {
      seq += 1;
      const employeeId = `EMP-2026${String(seq).padStart(4, "0")}`;
      const now = new Date();
      const employee: Employee = {
        id: seq,
        employeeId,
        type: dto.type,
        office: dto.office ?? null,
        department: dto.department ?? null,
        division: dto.division ?? null,
        section: dto.section ?? null,
        position: dto.position ?? null,
        reportsToEmployeeId: dto.reportsToEmployeeId ?? null,
        firstName: dto.firstName,
        middleName: dto.middleName ?? null,
        lastName: dto.lastName,
        nameExtension: dto.nameExtension ?? null,
        birthDate: dto.birthDate ?? null,
        birthPlace: dto.birthPlace ?? null,
        gender: dto.gender ?? null,
        civilStatus: dto.civilStatus ?? null,
        bloodType: dto.bloodType ?? null,
        country: dto.country ?? null,
        nationality: dto.nationality ?? null,
        citizenship: dto.citizenship ?? null,
        religion: dto.religion ?? null,
        disabilityType: dto.disabilityType ?? null,
        educationalAttainment: dto.educationalAttainment ?? null,
        degreeCourse: dto.degreeCourse ?? null,
        languages: dto.languages ?? null,
        personalEmail: dto.personalEmail,
        mobileNo: dto.mobileNo ?? null,
        telephoneNo: dto.telephoneNo ?? null,
        currentAddress: dto.currentAddress ?? null,
        emergencyContactName: dto.emergencyContactName ?? null,
        emergencyContactRelationship: dto.emergencyContactRelationship ?? null,
        emergencyContactNo: dto.emergencyContactNo ?? null,
        employmentStatus: dto.employmentStatus,
        employeeCategory: dto.employeeCategory ?? null,
        appointmentType: dto.appointmentType ?? null,
        employmentClassification: dto.employmentClassification ?? null,
        workArrangement: dto.workArrangement ?? null,
        workEmail: dto.workEmail ?? null,
        dateHired: dto.dateHired ?? null,
        regularizationDate: dto.regularizationDate ?? null,
        separationType: dto.separationType ?? null,
        separationReason: dto.separationReason ?? null,
        separationDate: dto.separationDate ?? null,
        tinNo: dto.tinNo ?? null,
        sssNo: dto.sssNo ?? null,
        philhealthNo: dto.philhealthNo ?? null,
        pagibigNo: dto.pagibigNo ?? null,
        createdAt: now,
        updatedAt: now,
      };
      const detail: EmployeeDetail = {
        employee,
        supervisor: null,
        account: {
          id: "550e8400-e29b-41d4-a716-446655440099",
          employeeId,
          name: `${dto.firstName} ${dto.lastName}`,
          email: dto.personalEmail,
          createdAt: now,
          updatedAt: now,
        },
      };
      store.set(employeeId, detail);
      return detail;
    },
    async update(employeeId: string, dto: UpdateEmployeeDto): Promise<EmployeeDetail> {
      const existing = await this.findOne(employeeId);
      const updated: EmployeeDetail = {
        ...existing,
        employee: {
          ...existing.employee,
          ...dto,
          updatedAt: new Date(),
        },
      };
      store.set(employeeId, updated);
      return updated;
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [EmployeesController],
      providers: [
        { provide: EmployeesService, useValue: stubEmployeesService },
        { provide: APP_PIPE, useClass: StandardSchemaValidationPipe },
        { provide: APP_FILTER, useClass: HttpExceptionFilter },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("creates, lists with pagination, fetches, updates, and disallows hard DELETE", async () => {
    const badCreate = await app.inject({
      method: "POST",
      url: "/employees",
      payload: { firstName: "", lastName: "", personalEmail: "not-an-email" },
    });
    expect(badCreate.statusCode).toBe(400);

    const createRes = await app.inject({
      method: "POST",
      url: "/employees",
      payload: {
        firstName: "Maria",
        lastName: "Santos",
        personalEmail: "maria.santos@example.com",
        department: "Engineering",
        position: "Software Engineer",
      },
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json() as {
      employee: { employeeId: string; employmentStatus: string };
      account: { email: string };
    };
    expect(created.employee.employeeId).toBe("EMP-20260001");
    expect(created.employee.employmentStatus).toBe("ACTIVE");
    expect(created.account.email).toBe("maria.santos@example.com");

    const listRes = await app.inject({
      method: "GET",
      url: "/employees?page=1&pageSize=10&sortBy=employeeId&sortDir=asc",
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json()).toMatchObject({
      meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    });

    const badParamRes = await app.inject({ method: "GET", url: "/employees/invalid-id" });
    expect(badParamRes.statusCode).toBe(400);

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/employees/${created.employee.employeeId}`,
      payload: { position: "Senior Software Engineer" },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json()).toMatchObject({
      employee: { position: "Senior Software Engineer" },
    });

    // No physical deletion route exists
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/employees/${created.employee.employeeId}`,
    });
    expect(deleteRes.statusCode).toBe(404);
  });
});
