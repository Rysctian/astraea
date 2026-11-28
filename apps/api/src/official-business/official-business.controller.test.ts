import { StandardSchemaValidationPipe } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SessionAuthGuard } from "../auth/auth.guard.js";
import { OfficialBusinessController } from "./official-business.controller.js";
import { OfficialBusinessService } from "./official-business.service.js";

describe("OfficialBusinessController", () => {
  let app: NestFastifyApplication;
  const mockService = {
    getFilingContext: vi.fn().mockResolvedValue({ currentEmployee: null }),
    listApplications: vi.fn().mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, pageSize: 20, totalPages: 1 },
    }),
    createApplications: vi.fn().mockResolvedValue({ createdCount: 1, applications: [] }),
    approveApplication: vi.fn().mockResolvedValue({ id: 1, status: "approved" }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OfficialBusinessController],
      providers: [{ provide: OfficialBusinessService, useValue: mockService }],
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

  it("enforces OB destination rule and routes valid OB/WFH submissions", async () => {
    const missingDest = await app.inject({
      method: "POST",
      url: "/official-business",
      payload: {
        obType: "ob",
        reason: "Client visit",
        details: [{ date: "2026-12-01", startTime: "09:00", endTime: "17:00" }],
      },
    });
    expect(missingDest.statusCode).toBe(400);

    const validWfh = await app.inject({
      method: "POST",
      url: "/official-business",
      payload: {
        obType: "wfh",
        reason: "Remote delivery",
        details: [{ date: "2026-12-01", startTime: "08:00", endTime: "17:00" }],
      },
    });
    expect(validWfh.statusCode).toBe(201);
    expect(mockService.createApplications).toHaveBeenCalledTimes(1);
  });
});
