import "reflect-metadata";
import { ConflictException, NotFoundException, StandardSchemaValidationPipe } from "@nestjs/common";
import { APP_FILTER, APP_PIPE } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import type {
  CreateUserDto,
  ListUsersQuery,
  PaginatedResponse,
  UpdateUserDto,
  User,
} from "@starter/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HttpExceptionFilter } from "../common/filters/http-exception.filter.js";
import { HealthController } from "../health/health.controller.js";
import { UsersController } from "./users.controller.js";
import { UsersService } from "./users.service.js";

describe("HTTP pipeline (NestJS 12 + Fastify 5 + Standard Schema)", () => {
  let app: NestFastifyApplication;
  const store = new Map<string, User>();

  const stubUsersService = {
    async findAll(query: ListUsersQuery): Promise<PaginatedResponse<User>> {
      const data = [...store.values()];
      return {
        data,
        meta: {
          page: query.page,
          pageSize: query.pageSize,
          total: data.length,
          totalPages: Math.max(1, Math.ceil(data.length / query.pageSize)),
        },
      };
    },
    async findOne(id: string): Promise<User> {
      const user = store.get(id);
      if (!user) {
        throw new NotFoundException(`User ${id} not found`);
      }
      return user;
    },
    async create(dto: CreateUserDto): Promise<User> {
      if ([...store.values()].some((u) => u.email === dto.email)) {
        throw new ConflictException(`Email ${dto.email} is already in use`);
      }
      const now = new Date();
      const user: User = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        employeeId: null,
        email: dto.email,
        name: dto.name,
        createdAt: now,
        updatedAt: now,
      };
      store.set(user.id, user);
      return user;
    },
    async update(id: string, dto: UpdateUserDto): Promise<User> {
      const user = await this.findOne(id);
      const updated: User = { ...user, ...dto, updatedAt: new Date() };
      store.set(id, updated);
      return updated;
    },
    async remove(id: string): Promise<void> {
      await this.findOne(id);
      store.delete(id);
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController, UsersController],
      providers: [
        { provide: UsersService, useValue: stubUsersService },
        { provide: APP_PIPE, useClass: StandardSchemaValidationPipe },
        { provide: APP_FILTER, useClass: HttpExceptionFilter },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health returns 200 ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok" });
  });

  it("rejects invalid body and invalid UUID param with 400", async () => {
    const badBody = await app.inject({
      method: "POST",
      url: "/users",
      payload: { email: "not-an-email", name: "" },
    });
    expect(badBody.statusCode).toBe(400);

    const badParam = await app.inject({
      method: "GET",
      url: "/users/not-a-uuid",
    });
    expect(badParam.statusCode).toBe(400);
  });

  it("creates, updates, conflicts on duplicate, deletes, and returns 404 after delete", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/users",
      payload: { email: "  alice@example.com ", name: " Alice " },
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json() as { id: string; email: string; name: string };
    expect(created.email).toBe("alice@example.com");
    expect(created.name).toBe("Alice");

    const dupRes = await app.inject({
      method: "POST",
      url: "/users",
      payload: { email: "alice@example.com", name: "Alice 2" },
    });
    expect(dupRes.statusCode).toBe(409);

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/users/${created.id}`,
      payload: { name: "Alice Updated" },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json()).toMatchObject({ name: "Alice Updated" });

    const delRes = await app.inject({ method: "DELETE", url: `/users/${created.id}` });
    expect(delRes.statusCode).toBe(204);

    const missingRes = await app.inject({ method: "GET", url: `/users/${created.id}` });
    expect(missingRes.statusCode).toBe(404);
  });
});
