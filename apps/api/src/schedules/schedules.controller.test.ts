import { StandardSchemaValidationPipe } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SessionAuthGuard } from "../auth/auth.guard.js";
import { SchedulesController } from "./schedules.controller.js";
import { SchedulesService } from "./schedules.service.js";

describe("SchedulesController", () => {
  let app: NestFastifyApplication;
  const mockService = {
    listSchedules: vi.fn().mockResolvedValue({
      data: [
        {
          id: 1,
          name: "Regular 9AM–6PM",
          timezone: "Asia/Manila",
          attendancePolicyId: null,
          attendancePolicyName: null,
          isActive: true,
          workingDaysCount: 5,
          assignmentCount: 0,
          isLocked: false,
          details: [],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    }),
    batchAssign: vi.fn().mockResolvedValue([]),
    createSchedule: vi.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SchedulesController],
      providers: [{ provide: SchedulesService, useValue: mockService }],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({
        canActivate: (ctx: {
          switchToHttp: () => { getRequest: () => Record<string, unknown> };
        }) => {
          ctx.switchToHttp().getRequest().authUser = {
            id: "00000000-0000-0000-0000-000000000042",
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

  it("lists schedules and server-stamps authenticated actor on batch assignment", async () => {
    const listRes = await app.inject({ method: "GET", url: "/schedules" });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().data[0].name).toBe("Regular 9AM–6PM");

    const assignRes = await app.inject({
      method: "POST",
      url: "/schedules/assignments/batch",
      payload: {
        scheduleId: 1,
        employeeIds: ["EMP-20260001"],
        effectiveFrom: "2026-05-01",
      },
    });
    expect(assignRes.statusCode).toBe(201);
    expect(mockService.batchAssign).toHaveBeenCalledWith(
      {
        scheduleId: 1,
        employeeIds: ["EMP-20260001"],
        effectiveFrom: "2026-05-01",
      },
      "00000000-0000-0000-0000-000000000042",
    );
  });
});
