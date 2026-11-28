import { ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { type Database, sessions, users } from "@starter/db";
import type { LoginDto, RegisterDto, User } from "@starter/shared";
import { and, eq, gt } from "drizzle-orm";
import { ENV } from "../config/config.module.js";
import type { AppEnv } from "../config/env.js";
import { DB } from "../database/database.module.js";
import {
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from "./password.js";

const publicUserColumns = {
  id: users.id,
  employeeId: users.employeeId,
  roleId: users.roleId,
  email: users.email,
  name: users.name,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const pgError = error as { code?: string; cause?: { code?: string } };
  return pgError.code === "23505" || pgError.cause?.code === "23505";
}

export interface SessionResult {
  user: User;
  token: string;
  expiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: AppEnv,
  ) {}

  async register(dto: RegisterDto): Promise<SessionResult> {
    const passwordHash = await hashPassword(dto.password);

    let created: User | undefined;
    try {
      const [row] = await this.db
        .insert(users)
        .values({
          email: dto.email,
          name: dto.name,
          passwordHash,
        })
        .returning(publicUserColumns);
      created = row;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`Email ${dto.email} is already in use`);
      }
      throw error;
    }

    if (!created) {
      throw new Error("Failed to register user");
    }

    return this.createSession(created);
  }

  async login(dto: LoginDto): Promise<SessionResult> {
    const [account] = await this.db
      .select({
        id: users.id,
        employeeId: users.employeeId,
        roleId: users.roleId,
        email: users.email,
        name: users.name,
        passwordHash: users.passwordHash,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.email, dto.email))
      .limit(1);

    if (!account?.passwordHash) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const valid = await verifyPassword(dto.password, account.passwordHash);
    if (!valid) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const user: User = {
      id: account.id,
      employeeId: account.employeeId,
      roleId: account.roleId,
      email: account.email,
      name: account.name,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };

    return this.createSession(user);
  }

  async getSessionUser(token: string): Promise<User | null> {
    const tokenHash = hashSessionToken(token);
    const [row] = await this.db
      .select(publicUserColumns)
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
      .limit(1);

    return row ?? null;
  }

  async logout(token: string): Promise<void> {
    const tokenHash = hashSessionToken(token);
    await this.db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  }

  private async createSession(user: User): Promise<SessionResult> {
    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token);
    const expiresAt = new Date(Date.now() + this.env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

    await this.db.insert(sessions).values({
      tokenHash,
      userId: user.id,
      expiresAt,
    });

    return { user, token, expiresAt };
  }
}
