import { Module } from "@nestjs/common";
import { ReferenceSetupController } from "./reference-setup.controller.js";
import { ReferenceSetupService } from "./reference-setup.service.js";

@Module({
  controllers: [ReferenceSetupController],
  providers: [ReferenceSetupService],
  exports: [ReferenceSetupService],
})
export class ReferenceSetupModule {}
