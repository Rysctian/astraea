import { Module, StandardSchemaValidationPipe } from "@nestjs/common";
import { APP_FILTER, APP_PIPE } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";
import { AttendanceModule } from "./attendance/attendance.module.js";
import { AttendancePoliciesModule } from "./attendance-policies/attendance-policies.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter.js";
import { ConfigModule, ENV } from "./config/config.module.js";
import type { AppEnv } from "./config/env.js";
import { CutOffsModule } from "./cut-offs/cut-offs.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { EmployeesModule } from "./employees/employees.module.js";
import { HealthModule } from "./health/health.module.js";
import { OrganizationModule } from "./organization/organization.module.js";
import { RbacModule } from "./rbac/rbac.module.js";
import { ReferenceSetupModule } from "./reference-setup/reference-setup.module.js";
import { SchedulesModule } from "./schedules/schedules.module.js";
import { UsersModule } from "./users/users.module.js";

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: AppEnv) => ({
        pinoHttp: {
          level: env.NODE_ENV === "test" ? "silent" : env.LOG_LEVEL,
          transport: env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
        },
      }),
    }),
    DatabaseModule,
    AuthModule,
    AttendanceModule,
    AttendancePoliciesModule,
    CutOffsModule,
    EmployeesModule,
    OrganizationModule,
    RbacModule,
    ReferenceSetupModule,
    SchedulesModule,
    HealthModule,
    UsersModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useClass: StandardSchemaValidationPipe,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
