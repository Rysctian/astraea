import { StandardSchemaValidationPipe } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SessionAuthGuard } from "../auth/auth.guard.js";
import { AttendancePoliciesController } from "./attendance-policies.controller.js";
import { AttendancePoliciesService } from "./attendance-policies.service.js";

describe("AttendancePoliciesController", () => {
  let app: NestFastifyApplication;
  const mockService = {
    list: vi.fn().mockResolvedValue({
      data: [
        {
          id: 1,
          name: "Standard Office Policy",
          description: "15m grace",
          tardyGraceSeconds: 900,
          tardyCountFrom: "schedule_start",
          absentAfterLateSeconds: 3600,
          undertimeGraceSeconds: 0,
          earlyInWindowSeconds: 14400,
          lateOutWindowSeconds: 14400,
          duplicateTapWindowSeconds: 120,
          isDefault: true,
          isActive: true,
          scheduleCount: 2,
          canDelete: false,
          deleteBlockedReason: "System default policy cannot be deleted",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    }),
    getOptions: vi.fn().mockResolvedValue({
      defaultPolicyId: 1,
      defaultPolicyName: "Standard Office Policy",
      items: [],
    }),
    create: vi.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AttendancePoliciesController],
      providers: [{ provide: AttendancePoliciesService, useValue: mockService }],
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

  it("lists policies and validates cross-field bounds on create", async () => {
    const listRes = await app.inject({ method: "GET", url: "/attendance-policies" });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().data[0].name).toBe("Standard Office Policy");

    const invalidRes = await app.inject({
      method: "POST",
      url: "/attendance-policies",
      payload: {
        name: "Broken Policy",
        tardyGraceSeconds: 1200,
        absentAfterLateSeconds: 600,
      },
    });
    expect(invalidRes.statusCode).toBe(400);
    expect(mockService.create).not.toHaveBeenCalled();
  });
});
