import { StandardSchemaValidationPipe } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SessionAuthGuard } from "../auth/auth.guard.js";
import { RbacService } from "../rbac/rbac.service.js";
import { ApproverSetupController } from "./approver-setup.controller.js";
import { ApproverSetupService } from "./approver-setup.service.js";

describe("ApproverSetupController", () => {
  let app: NestFastifyApplication;
  const mockService = {
    listWorkflows: vi.fn().mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, pageSize: 20, totalPages: 1 },
    }),
    saveWorkflows: vi.fn().mockResolvedValue({
      updatedEmployeeCount: 2,
      applicationType: "overtime",
      stepCount: 2,
    }),
    deleteWorkflow: vi.fn().mockResolvedValue(undefined),
  };
  const mockRbac = {
    getActorAuthority: vi.fn().mockResolvedValue({
      roleCode: "admin",
      permissions: {
        approver_setup: { canView: true, canCreate: true, canUpdate: true, canDelete: true },
      },
      isAdmin: true,
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ApproverSetupController],
      providers: [
        { provide: ApproverSetupService, useValue: mockService },
        { provide: RbacService, useValue: mockRbac },
      ],
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

  it("lists workflows and validates consecutive sequence saves", async () => {
    const listRes = await app.inject({ method: "GET", url: "/approver-setup" });
    expect(listRes.statusCode).toBe(200);

    const invalidSave = await app.inject({
      method: "POST",
      url: "/approver-setup",
      payload: {
        employeeIds: ["EMP-20260001"],
        applicationType: "overtime",
        approvers: [{ sequence: 2, approverId: "EMP-20260002" }],
      },
    });
    expect(invalidSave.statusCode).toBe(400);

    const validSave = await app.inject({
      method: "POST",
      url: "/approver-setup",
      payload: {
        employeeIds: ["EMP-20260001", "EMP-20260002"],
        applicationType: "overtime",
        approvers: [
          { sequence: 1, approverId: "EMP-20260010" },
          { sequence: 2, approverId: "EMP-20260020" },
        ],
      },
    });
    expect(validSave.statusCode).toBe(201);
    expect(mockService.saveWorkflows).toHaveBeenCalledTimes(1);
  });
});
