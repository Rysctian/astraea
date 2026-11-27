import "reflect-metadata";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configureApp } from "./app.setup.js";
import type { AppEnv } from "./config/env.js";
import { HealthController } from "./health/health.controller.js";

describe("configureApp (Swagger + CORS + Helmet)", () => {
  let app: NestFastifyApplication;

  const testEnv: AppEnv = {
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: 3001,
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/starter",
    CORS_ORIGIN: "http://localhost:5173",
    LOG_LEVEL: "silent",
    SESSION_TTL_DAYS: 7,
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app, testEnv);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("serves Swagger UI at /docs without crashing", async () => {
    const res = await app.inject({ method: "GET", url: "/docs" });
    expect([200, 301, 302]).toContain(res.statusCode);
  });

  it("allows CORS preflight for PATCH and DELETE methods", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/health",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "DELETE",
      },
    });
    expect(res.statusCode).toBe(204);
    const allowMethods = String(res.headers["access-control-allow-methods"] ?? "");
    expect(allowMethods).toContain("DELETE");
    expect(allowMethods).toContain("PATCH");
  });
});
