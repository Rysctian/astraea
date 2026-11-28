import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { RbacModule } from "../rbac/rbac.module.js";
import { ApprovalEngineService } from "./approval-engine.service.js";
import { ApproverSetupController } from "./approver-setup.controller.js";
import { ApproverSetupService } from "./approver-setup.service.js";

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [ApproverSetupController],
  providers: [ApprovalEngineService, ApproverSetupService],
  exports: [ApprovalEngineService, ApproverSetupService],
})
export class ApprovalsModule {}
