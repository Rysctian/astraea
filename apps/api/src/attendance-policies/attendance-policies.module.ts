import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AttendancePoliciesController } from "./attendance-policies.controller.js";
import { AttendancePoliciesService } from "./attendance-policies.service.js";

@Module({
  imports: [AuthModule],
  controllers: [AttendancePoliciesController],
  providers: [AttendancePoliciesService],
  exports: [AttendancePoliciesService],
})
export class AttendancePoliciesModule {}
