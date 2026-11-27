import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { createDb } from "@starter/db";
import { ENV } from "../config/config.module.js";
import type { AppEnv } from "../config/env.js";

export const DB = Symbol("DB");
const DB_CLIENT = Symbol("DB_CLIENT");

type DbBundle = ReturnType<typeof createDb>;

@Global()
@Module({
  providers: [
    {
      provide: DB_CLIENT,
      inject: [ENV],
      useFactory: (env: AppEnv) => createDb(env.DATABASE_URL),
    },
    {
      provide: DB,
      inject: [DB_CLIENT],
      useFactory: (bundle: DbBundle) => bundle.db,
    },
  ],
  exports: [DB],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DB_CLIENT) private readonly bundle: DbBundle) {}

  async onApplicationShutdown(): Promise<void> {
    await this.bundle.client.end();
  }
}
