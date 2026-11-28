import { StandardSchemaValidationPipe } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SessionAuthGuard } from "../auth/auth.guard.js";
import { OvertimeController } from "./overtime.controller.js";
import { OvertimeService } from "./overtime.service.js";

describe("OvertimeController", () => {
  let app: NestFastifyApplication;
  const mockService = {
    listApplications: vi.fn().mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, pageSize: 20, totalPages: 1 },
    }),
    createApplications: vi.fn().mockResolvedValue({
      createdCount: 1,
      applications: [],
    }),
    approveApplication: vi.fn().mockResolvedValue({ id: 1, status: "approved" }),
    disapproveApplication: vi.fn().mockResolvedValue({ id: 1, status: "disapproved" }),
    cancelApplication: vi.fn().mockResolvedValue({ id: 1, status: "cancelled" }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OvertimeController],
      providers: [{ provide: OvertimeService, useValue: mockService }],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({
        canActivate: (ctx: {
          switchToHttp: () => { getRequest: () => Record<string, unknown> };
        }) => {
          ctx.switchToHttp().getRequest().authUser = {
            id: "00000000-0000-0000-0000-000000000001",
            employeeId: "EMP-20260001",
            email: "admin@astraea.local",
            name: "Admin",
          };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects client-supplied protected status and routes valid overtime creation and decisions", async () => {
    const rejected = await app.inject({
      method: "POST",
      url: "/overtime",
      payload: {
        reason: "Deployment",
        status: "approved",
        details: [{ date: "2026-11-28", startTime: "18:00", endTime: "20:00", breakSeconds: 0 }],
      },
    });
    expect(rejected.statusCode).toBe(400);

    const created = await app.inject({
      method: "POST",
      url: "/overtime",
      payload: {
        reason: "Deployment",
        autoApprove: false,
        details: [{ date: "2026-11-28", startTime: "18:00", endTime: "20:00", breakSeconds: 0 }],
      },
    });
    expect(created.statusCode).toBe(201);
    expect(mockService.createApplications).toHaveBeenCalledTimes(1);

    const approved = await app.inject({
      method: "POST",
      url: "/overtime/1/approve",
      payload: { remarks: "Looks good" },
    });
    expect(approved.statusCode).toBe(201);
  });
});
