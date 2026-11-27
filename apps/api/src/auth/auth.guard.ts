import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { User } from "@starter/shared";
import type { FastifyRequest } from "fastify";
import { AuthService } from "./auth.service.js";

export const SESSION_COOKIE_NAME = "astraea_session";

export interface AuthenticatedFastifyRequest extends FastifyRequest {
  authUser?: User;
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedFastifyRequest>();
    const token = request.cookies?.[SESSION_COOKIE_NAME];

    if (!token) {
      throw new UnauthorizedException("Authentication required");
    }

    const user = await this.authService.getSessionUser(token);
    if (!user) {
      throw new UnauthorizedException("Session expired or invalid");
    }

    request.authUser = user;
    return true;
  }
}
