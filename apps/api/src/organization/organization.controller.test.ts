import "reflect-metadata";
import { BadRequestException, StandardSchemaValidationPipe } from "@nestjs/common";
import { APP_FILTER, APP_PIPE } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import type {
  ListOrgQuery,
  OrgEntityType,
  OrgRecord,
  OrgSummaryCounts,
  PaginatedResponse,
} from "@starter/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HttpExceptionFilter } from "../common/filters/http-exception.filter.js";
import { OrganizationController } from "./organization.controller.js";
import { OrganizationService } from "./organization.service.js";

describe("Organizational Setup HTTP pipeline", () => {
  let app: NestFastifyApplication;
  const officeRows: OrgRecord[] = [
    {
      id: 1,
      code: "HO",
      name: "Head Office",
      shortName: "HO",
      type: "office",
      parentId: null,
      headEmployeeId: null,
      description: null,
      sortOrder: 0,
      isActive: true,
      usageCount: 2,
      isInUse: true,
      usageReason: "Referenced by 2 departments. Deactivate instead of deleting.",
      createdAt: "2026-11-27T00:00:00.000Z",
      updatedAt: "2026-11-27T00:00:00.000Z",
    },
  ];

  const stubOrgService = {
    async getSummary(): Promise<OrgSummaryCounts> {
      return {
        offices: { total: officeRows.length, active: officeRows.length },
        departments: { total: 2, active: 2 },
        divisions: { total: 0, active: 0 },
        sections: { total: 0, active: 0 },
        positions: { total: 0, active: 0 },
        reports_items: { total: 0, active: 0 },
      };
    },
    async getActiveOptions() {
      return {
        offices: officeRows.map((o) => ({ id: o.id, code: o.code, label: o.name ?? "" })),
        departments: [],
        divisions: [],
        sections: [],
        positions: [],
        reports_items: [],
      };
    },
    async getTree() {
      return { offices: [], unassignedDepartments: [] };
    },
    async list(_entity: OrgEntityType, query: ListOrgQuery): Promise<PaginatedResponse<OrgRecord>> {
      return {
        data: officeRows,
        meta: {
          page: query.page,
          pageSize: query.pageSize,
          total: officeRows.length,
          totalPages: 1,
        },
      };
    },
    async create(_entity: OrgEntityType, body: Record<string, unknown>): Promise<OrgRecord> {
      const created: OrgRecord = {
        id: officeRows.length + 1,
        code: String(body.code ?? "").toUpperCase(),
        name: String(body.name ?? ""),
        type: "office",
        description: null,
        sortOrder: 0,
        isActive: true,
        usageCount: 0,
        isInUse: false,
        usageReason: null,
        createdAt: "2026-11-27T00:00:00.000Z",
        updatedAt: "2026-11-27T00:00:00.000Z",
      };
      officeRows.push(created);
      return created;
    },
    async update(
      _entity: OrgEntityType,
      id: number,
      body: Record<string, unknown>,
    ): Promise<OrgRecord> {
      const target = officeRows.find((o) => o.id === id);
      if (!target) throw new BadRequestException("Not found");
      Object.assign(target, body);
      return target;
    },
    async remove(_entity: OrgEntityType, id: number): Promise<void> {
      const target = officeRows.find((o) => o.id === id);
      if (target?.isInUse) {
        throw new BadRequestException(target.usageReason);
      }
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OrganizationController],
      providers: [
        { provide: OrganizationService, useValue: stubOrgService },
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

  it("serves summary, lists offices, creates, and blocks deleting in-use entities", async () => {
    const sumRes = await app.inject({ method: "GET", url: "/organization/summary" });
    expect(sumRes.statusCode).toBe(200);
    expect(sumRes.json()).toMatchObject({ offices: { total: 1 } });

    const invalidEntity = await app.inject({ method: "GET", url: "/organization/unknown" });
    expect(invalidEntity.statusCode).toBe(400);

    const listRes = await app.inject({
      method: "GET",
      url: "/organization/offices?page=1&pageSize=10&sortBy=sortOrder&sortDir=asc",
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json()).toMatchObject({ meta: { total: 1 } });

    const blockedDelete = await app.inject({ method: "DELETE", url: "/organization/offices/1" });
    expect(blockedDelete.statusCode).toBe(400);

    const createRes = await app.inject({
      method: "POST",
      url: "/organization/offices",
      payload: { code: "br-01", name: "Branch 1" },
    });
    expect(createRes.statusCode).toBe(201);
    expect(createRes.json()).toMatchObject({ code: "BR-01" });

    const okDelete = await app.inject({ method: "DELETE", url: "/organization/offices/2" });
    expect(okDelete.statusCode).toBe(204);
  });
});
