import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { RbacController } from "./rbac.controller.js";
import { RbacService } from "./rbac.service.js";

@Module({
  imports: [AuthModule],
  controllers: [RbacController],
  providers: [RbacService],
  exports: [RbacService],
})
export class RbacModule {}
