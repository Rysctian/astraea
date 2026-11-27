import "reflect-metadata";
import fs from "node:fs";
import path from "node:path";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module.js";
import { configureApp } from "./app.setup.js";
import { ENV } from "./config/config.module.js";
import type { AppEnv } from "./config/env.js";

for (const envPath of [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../.env"),
  path.resolve(import.meta.dirname, "../../.env"),
  path.resolve(import.meta.dirname, "../../../.env"),
]) {
  if (fs.existsSync(envPath)) {
    try {
      process.loadEnvFile?.(envPath);
      break;
    } catch {
      // ignore
    }
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  const env = app.get<AppEnv>(ENV);
  await configureApp(app, env);

  await app.listen(env.PORT, env.HOST);
}

void bootstrap();
