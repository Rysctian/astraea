import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { createDb } from "@starter/db";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, "../../../../packages/db/drizzle");

describe("Users API (integration)", () => {
  let container: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17-alpine").start();
    const databaseUrl = container.getConnectionUri();

    const { db, client } = createDb(databaseUrl);
    await migrate(db, { migrationsFolder });
    await client.end();

    process.env.DATABASE_URL = databaseUrl;
    process.env.NODE_ENV = "test";

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it("GET /health returns 200 ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok" });
  });

  it("supports full CRUD lifecycle and rejects invalid/duplicate input", async () => {
    const badRes = await app.inject({
      method: "POST",
      url: "/users",
      payload: { email: "invalid", name: "" },
    });
    expect(badRes.statusCode).toBe(400);

    const createRes = await app.inject({
      method: "POST",
      url: "/users",
      payload: { email: "alice@example.com", name: "Alice" },
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json() as { id: string; email: string; name: string };
    expect(created.email).toBe("alice@example.com");

    const dupRes = await app.inject({
      method: "POST",
      url: "/users",
      payload: { email: "alice@example.com", name: "Alice 2" },
    });
    expect(dupRes.statusCode).toBe(409);

    const listRes = await app.inject({ method: "GET", url: "/users" });
    expect(listRes.statusCode).toBe(200);
    const listBody = listRes.json() as { data: unknown[]; meta: { total: number } };
    expect(listBody.data).toHaveLength(1);
    expect(listBody.meta.total).toBe(1);

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/users/${created.id}`,
      payload: { name: "Alice Updated" },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json()).toMatchObject({ name: "Alice Updated" });

    const deleteRes = await app.inject({ method: "DELETE", url: `/users/${created.id}` });
    expect(deleteRes.statusCode).toBe(204);

    const missingRes = await app.inject({ method: "GET", url: `/users/${created.id}` });
    expect(missingRes.statusCode).toBe(404);
  });
});
