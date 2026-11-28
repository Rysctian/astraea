import "reflect-metadata";
import cookie from "@fastify/cookie";
import {
  ConflictException,
  StandardSchemaValidationPipe,
  UnauthorizedException,
} from "@nestjs/common";
import { APP_FILTER, APP_PIPE } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import type { LoginDto, RegisterDto, User } from "@starter/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HttpExceptionFilter } from "../common/filters/http-exception.filter.js";
import { ENV } from "../config/config.module.js";
import type { AppEnv } from "../config/env.js";
import { AuthController } from "./auth.controller.js";
import { SESSION_COOKIE_NAME, SessionAuthGuard } from "./auth.guard.js";
import { AuthService, type SessionResult } from "./auth.service.js";

describe("Auth HTTP pipeline (cookie sessions)", () => {
  let app: NestFastifyApplication;
  const usersByEmail = new Map<string, { user: User; password: string }>();
  const sessionsByToken = new Map<string, User>();

  const testEnv: AppEnv = {
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: 3001,
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/starter",
    CORS_ORIGIN: "http://localhost:5173",
    LOG_LEVEL: "silent",
    SESSION_TTL_DAYS: 7,
  };

  const stubAuthService = {
    async register(dto: RegisterDto): Promise<SessionResult> {
      if (usersByEmail.has(dto.email)) {
        throw new ConflictException(`Email ${dto.email} is already in use`);
      }
      const now = new Date();
      const user: User = {
        id: "550e8400-e29b-41d4-a716-446655440001",
        employeeId: null,
        roleId: null,
        email: dto.email,
        name: dto.name,
        createdAt: now,
        updatedAt: now,
      };
      usersByEmail.set(dto.email, { user, password: dto.password });
      const token = `tok-${sessionsByToken.size + 1}`;
      sessionsByToken.set(token, user);
      return { user, token, expiresAt: new Date(Date.now() + 60_000) };
    },
    async login(dto: LoginDto): Promise<SessionResult> {
      const entry = usersByEmail.get(dto.email);
      if (!entry || entry.password !== dto.password) {
        throw new UnauthorizedException("Invalid email or password");
      }
      const token = `tok-${sessionsByToken.size + 1}`;
      sessionsByToken.set(token, entry.user);
      return { user: entry.user, token, expiresAt: new Date(Date.now() + 60_000) };
    },
    async getSessionUser(token: string): Promise<User | null> {
      return sessionsByToken.get(token) ?? null;
    },
    async logout(token: string): Promise<void> {
      sessionsByToken.delete(token);
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        SessionAuthGuard,
        { provide: AuthService, useValue: stubAuthService },
        { provide: ENV, useValue: testEnv },
        { provide: APP_PIPE, useClass: StandardSchemaValidationPipe },
        { provide: APP_FILTER, useClass: HttpExceptionFilter },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(cookie);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("rejects GET /auth/me without a session cookie", async () => {
    const res = await app.inject({ method: "GET", url: "/auth/me" });
    expect(res.statusCode).toBe(401);
  });

  it("registers, sets an httpOnly cookie, authenticates /auth/me, and logs out", async () => {
    const badRes = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { name: "", email: "invalid", password: "short" },
    });
    expect(badRes.statusCode).toBe(400);

    const registerRes = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { name: "Alex Rivera", email: "Alex@Example.com", password: "Password123!" },
    });
    expect(registerRes.statusCode).toBe(201);
    expect(registerRes.json()).toMatchObject({
      user: { email: "alex@example.com", name: "Alex Rivera" },
    });

    const sessionCookie = registerRes.cookies.find((c) => c.name === SESSION_COOKIE_NAME);
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.httpOnly).toBe(true);

    const meRes = await app.inject({
      method: "GET",
      url: "/auth/me",
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie?.value ?? "" },
    });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json()).toMatchObject({ user: { email: "alex@example.com" } });

    const logoutRes = await app.inject({
      method: "POST",
      url: "/auth/logout",
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie?.value ?? "" },
    });
    expect(logoutRes.statusCode).toBe(204);

    const afterLogoutRes = await app.inject({
      method: "GET",
      url: "/auth/me",
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie?.value ?? "" },
    });
    expect(afterLogoutRes.statusCode).toBe(401);
  });

  it("logs in with valid credentials and rejects invalid passwords with 401", async () => {
    const badLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "alex@example.com", password: "WrongPassword!" },
    });
    expect(badLogin.statusCode).toBe(401);

    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "alex@example.com", password: "Password123!" },
    });
    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.cookies.some((c) => c.name === SESSION_COOKIE_NAME && c.httpOnly)).toBe(true);
  });
});
