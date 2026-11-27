import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  type AuthResponse,
  type LoginDto,
  loginSchema,
  type RegisterDto,
  registerSchema,
} from "@starter/shared";
import type { FastifyReply } from "fastify";
import { ENV } from "../config/config.module.js";
import type { AppEnv } from "../config/env.js";
import {
  type AuthenticatedFastifyRequest,
  SESSION_COOKIE_NAME,
  SessionAuthGuard,
} from "./auth.guard.js";
import { AuthService } from "./auth.service.js";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(ENV) private readonly env: AppEnv,
  ) {}

  @Post("register")
  @ApiOperation({ summary: "Register a new user account and start a session" })
  async register(
    @Body({ schema: registerSchema }) body: RegisterDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthResponse> {
    const { user, token, expiresAt } = await this.authService.register(body);
    this.setSessionCookie(reply, token, expiresAt);
    return { user };
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Sign in with email and password" })
  async login(
    @Body({ schema: loginSchema }) body: LoginDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthResponse> {
    const { user, token, expiresAt } = await this.authService.login(body);
    this.setSessionCookie(reply, token, expiresAt);
    return { user };
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Sign out and revoke the current session" })
  async logout(
    @Req() request: AuthenticatedFastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const token = request.cookies?.[SESSION_COOKIE_NAME];
    if (token) {
      await this.authService.logout(token);
    }
    reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
  }

  @Get("me")
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: "Get the currently authenticated user" })
  me(@Req() request: AuthenticatedFastifyRequest): AuthResponse {
    if (!request.authUser) {
      throw new Error("Authenticated user missing from request");
    }
    return { user: request.authUser };
  }

  private setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
    reply.setCookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: this.env.NODE_ENV === "production",
      path: "/",
      expires: expiresAt,
    });
  }
}
