import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const responseBody = isHttp ? exception.getResponse() : "Internal server error";

    const details =
      typeof responseBody === "string"
        ? { message: responseBody }
        : (responseBody as Record<string, unknown>);

    void reply.status(status).send({
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
      ...details,
    });
  }
}
