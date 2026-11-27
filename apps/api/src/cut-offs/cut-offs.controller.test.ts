import { StandardSchemaValidationPipe } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SessionAuthGuard } from "../auth/auth.guard.js";
import { CutOffsController } from "./cut-offs.controller.js";
import { CutOffsService } from "./cut-offs.service.js";

describe("CutOffsController", () => {
  let app: NestFastifyApplication;
  const mockService = {
    list: vi.fn().mockResolvedValue({
      data: [
        {
          id: 1,
          scheduleType: "semi_monthly",
          name: "October 2026 Semi-Monthly",
          year: 2026,
          month: 10,
          isActive: true,
          periods: [],
          createdAt: "2026-10-01T00:00:00.000Z",
          updatedAt: "2026-10-01T00:00:00.000Z",
        },
      ],
      meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    }),
    getActivePresets: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CutOffsController],
      providers: [{ provide: CutOffsService, useValue: mockService }],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("lists cut-offs and rejects unknown period fields on create", async () => {
    const listRes = await app.inject({ method: "GET", url: "/cut-offs" });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().data[0].name).toBe("October 2026 Semi-Monthly");

    const badRes = await app.inject({
      method: "POST",
      url: "/cut-offs",
      payload: {
        scheduleType: "monthly",
        name: "Invalid Extra Key",
        year: 2026,
        month: 10,
        periods: [
          {
            id: 99,
            cutOffNo: 1,
            noDtr: true,
            payrollDateFrom: "2026-10-01",
            payrollDateTo: "2026-10-31",
            releaseDate: "2026-11-05",
          },
        ],
      },
    });
    expect(badRes.statusCode).toBe(400);
    expect(mockService.create).not.toHaveBeenCalled();
  });
});
