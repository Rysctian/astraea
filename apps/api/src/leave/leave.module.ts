import { Module } from "@nestjs/common";
import { ApprovalsModule } from "../approvals/approvals.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { RbacModule } from "../rbac/rbac.module.js";
import { LeaveController } from "./leave.controller.js";
import { LeaveService } from "./leave.service.js";
import { LeaveStorageService } from "./leave-storage.js";

@Module({
  imports: [AuthModule, RbacModule, ApprovalsModule],
  controllers: [LeaveController],
  providers: [LeaveService, LeaveStorageService],
  exports: [LeaveService],
})
export class LeaveModule {}
