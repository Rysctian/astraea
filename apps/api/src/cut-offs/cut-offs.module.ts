import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { CutOffsController } from "./cut-offs.controller.js";
import { CutOffsService } from "./cut-offs.service.js";

@Module({
  imports: [AuthModule],
  controllers: [CutOffsController],
  providers: [CutOffsService],
  exports: [CutOffsService],
})
export class CutOffsModule {}
