import { StandardSchemaValidationPipe } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SessionAuthGuard } from "../auth/auth.guard.js";
import { AttendanceController } from "./attendance.controller.js";
import { AttendanceService } from "./attendance.service.js";

describe("AttendanceController", () => {
  let app: NestFastifyApplication;
  const mockService = {
    getDtr: vi.fn().mockResolvedValue({
      employeeId: "EMP-20260001",
      employeeName: "Christian Reyes",
      from: "2026-10-01",
      to: "2026-10-15",
      summary: {
        totalRenderedSeconds: 32400,
        totalScheduledSeconds: 32400,
        presentDays: 1,
        absentDays: 0,
        totalTardySeconds: 0,
        totalUndertimeSeconds: 0,
      },
      rows: [],
    }),
    listLogs: vi.fn().mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, pageSize: 20, totalPages: 1 },
    }),
    createManualLogs: vi.fn().mockResolvedValue({
      insertedCount: 2,
      skippedCount: 0,
      records: [],
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AttendanceController],
      providers: [{ provide: AttendanceService, useValue: mockService }],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({
        canActivate: (ctx: {
          switchToHttp: () => { getRequest: () => Record<string, unknown> };
        }) => {
          ctx.switchToHttp().getRequest().authUser = {
            id: "00000000-0000-0000-0000-000000000001",
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

  it("computes DTR and validates manual log submission", async () => {
    const dtrRes = await app.inject({
      method: "GET",
      url: "/attendance/dtr?employeeId=EMP-20260001&from=2026-10-01&to=2026-10-15",
    });
    expect(dtrRes.statusCode).toBe(200);
    expect(dtrRes.json().summary.presentDays).toBe(1);

    const invalidManual = await app.inject({
      method: "POST",
      url: "/attendance/logs/manual",
      payload: { employeeId: "EMP-20260001", date: "2026-10-05" },
    });
    expect(invalidManual.statusCode).toBe(400);

    const validManual = await app.inject({
      method: "POST",
      url: "/attendance/logs/manual",
      payload: {
        employeeId: "EMP-20260001",
        date: "2026-10-05",
        amIn: "08:00",
        pmOut: "17:00",
      },
    });
    expect(validManual.statusCode).toBe(201);
    expect(mockService.createManualLogs).toHaveBeenCalledTimes(1);
  });
});
