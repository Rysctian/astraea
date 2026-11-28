import { Module } from "@nestjs/common";
import { ApprovalsModule } from "../approvals/approvals.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { RbacModule } from "../rbac/rbac.module.js";
import { OfficialBusinessController } from "./official-business.controller.js";
import { OfficialBusinessService } from "./official-business.service.js";

@Module({
  imports: [AuthModule, RbacModule, ApprovalsModule],
  controllers: [OfficialBusinessController],
  providers: [OfficialBusinessService],
  exports: [OfficialBusinessService],
})
export class OfficialBusinessModule {}
