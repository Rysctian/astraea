import { StandardSchemaValidationPipe } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SessionAuthGuard } from "../auth/auth.guard.js";
import { RbacController } from "./rbac.controller.js";
import { RbacService } from "./rbac.service.js";

describe("RbacController", () => {
  let app: NestFastifyApplication;
  const mockService = {
    listRoles: vi.fn().mockResolvedValue({
      data: [
        {
          id: 1,
          code: "admin",
          name: "Administrator",
          isSystem: true,
          userCount: 1,
          grantCount: 9,
          canDelete: false,
          deleteBlockedReason: "Seeded system role cannot be deleted",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    }),
    createRole: vi.fn(),
    assignUserRole: vi.fn().mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440000",
      employeeId: null,
      roleId: 2,
      roleCode: "employee",
      roleName: "Employee",
      email: "user@astraea.local",
      name: "Test User",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RbacController],
      providers: [{ provide: RbacService, useValue: mockService }],
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

  it("lists roles, rejects invalid write-without-view grants, and assigns user roles", async () => {
    const listRes = await app.inject({ method: "GET", url: "/rbac/roles" });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().data[0].code).toBe("admin");

    const badRole = await app.inject({
      method: "POST",
      url: "/rbac/roles",
      payload: {
        name: "Broken",
        code: "broken_role",
        grants: [
          { menuId: 1, canView: false, canCreate: true, canUpdate: false, canDelete: false },
        ],
      },
    });
    expect(badRole.statusCode).toBe(400);
    expect(mockService.createRole).not.toHaveBeenCalled();

    const assignRes = await app.inject({
      method: "PATCH",
      url: "/rbac/users/550e8400-e29b-41d4-a716-446655440000/role",
      payload: { roleId: 2 },
    });
    expect(assignRes.statusCode).toBe(200);
    expect(mockService.assignUserRole).toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440000",
      { roleId: 2 },
      "00000000-0000-0000-0000-000000000001",
    );
  });
});
