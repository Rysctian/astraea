import { Module } from "@nestjs/common";
import { ApprovalsModule } from "../approvals/approvals.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { RbacModule } from "../rbac/rbac.module.js";
import { CorrectionsController } from "./corrections.controller.js";
import { CorrectionsService } from "./corrections.service.js";

@Module({
  imports: [AuthModule, RbacModule, ApprovalsModule],
  controllers: [CorrectionsController],
  providers: [CorrectionsService],
  exports: [CorrectionsService],
})
export class CorrectionsModule {}
