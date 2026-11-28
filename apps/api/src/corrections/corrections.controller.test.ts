import { StandardSchemaValidationPipe } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SessionAuthGuard } from "../auth/auth.guard.js";
import { CorrectionsController } from "./corrections.controller.js";
import { CorrectionsService } from "./corrections.service.js";

describe("CorrectionsController", () => {
  let app: NestFastifyApplication;
  const mockService = {
    getFilingContext: vi.fn().mockResolvedValue({ currentEmployee: null }),
    previewDateLogs: vi.fn().mockResolvedValue({
      employeeId: "EMP-20260001",
      date: "2026-11-28",
      timezone: "Asia/Manila",
      logs: [],
      paired: { amIn: null, amOut: null, pmIn: null, pmOut: null },
    }),
    listApplications: vi.fn().mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, pageSize: 20, totalPages: 1 },
    }),
    createApplication: vi.fn().mockResolvedValue({ id: 1, status: "pending" }),
    approveApplication: vi.fn().mockResolvedValue({ id: 1, status: "approved" }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CorrectionsController],
      providers: [{ provide: CorrectionsService, useValue: mockService }],
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

  it("previews date logs and validates chronological AM/PM punch corrections", async () => {
    const previewRes = await app.inject({
      method: "GET",
      url: "/corrections/preview?date=2026-11-28",
    });
    expect(previewRes.statusCode).toBe(200);

    const invalidEmpty = await app.inject({
      method: "POST",
      url: "/corrections",
      payload: {
        reason: "Forgot to log out",
        details: [{ date: "2026-11-28" }],
      },
    });
    expect(invalidEmpty.statusCode).toBe(400);

    const validRes = await app.inject({
      method: "POST",
      url: "/corrections",
      payload: {
        reason: "Forgot biometric out",
        details: [{ date: "2026-11-28", amIn: "08:00", pmOut: "17:00" }],
      },
    });
    expect(validRes.statusCode).toBe(201);
    expect(mockService.createApplication).toHaveBeenCalledTimes(1);
  });
});
