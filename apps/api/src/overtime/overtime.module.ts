import { Module } from "@nestjs/common";
import { ApprovalsModule } from "../approvals/approvals.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { RbacModule } from "../rbac/rbac.module.js";
import { OvertimeController } from "./overtime.controller.js";
import { OvertimeService } from "./overtime.service.js";

@Module({
  imports: [AuthModule, RbacModule, ApprovalsModule],
  controllers: [OvertimeController],
  providers: [OvertimeService],
  exports: [OvertimeService],
})
export class OvertimeModule {}
