import multipart from "@fastify/multipart";
import { StandardSchemaValidationPipe } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SessionAuthGuard } from "../auth/auth.guard.js";
import { LeaveController } from "./leave.controller.js";
import { LeaveService } from "./leave.service.js";

describe("LeaveController", () => {
  let app: NestFastifyApplication;
  const mockService = {
    getFilingOptions: vi.fn().mockResolvedValue({ currentEmployee: null, leaveTypes: [] }),
    getMyCredits: vi.fn().mockResolvedValue([]),
    listApplications: vi.fn().mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, pageSize: 20, totalPages: 1 },
    }),
    createApplication: vi.fn().mockResolvedValue({ id: 1, status: "pending" }),
    approveApplication: vi.fn().mockResolvedValue({ id: 1, status: "approved" }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [LeaveController],
      providers: [{ provide: LeaveService, useValue: mockService }],
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
    await app.register(multipart);
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("validates leave application payloads and routes valid JSON submissions", async () => {
    const badRes = await app.inject({
      method: "POST",
      url: "/leave/applications",
      payload: {
        leaveTypeId: 1,
        reason: "Trip",
        status: "approved",
        details: [{ date: "2026-12-01", durationType: "whole_day" }],
      },
    });
    expect(badRes.statusCode).toBe(400);

    const okRes = await app.inject({
      method: "POST",
      url: "/leave/applications",
      payload: {
        leaveTypeId: 1,
        reason: "Annual vacation",
        autoApprove: false,
        details: [{ date: "2026-12-01", durationType: "whole_day" }],
      },
    });
    expect(okRes.statusCode).toBe(201);
    expect(mockService.createApplication).toHaveBeenCalledTimes(1);

    const optRes = await app.inject({ method: "GET", url: "/leave/options" });
    expect(optRes.statusCode).toBe(200);
  });
});
