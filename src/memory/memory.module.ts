import { Module } from '@nestjs/common';
import { MemoryService } from './memory.service';
import { MemoryLearnerService } from './memory-learner.service';
import { ModesService } from './modes.service';
import { EmbedderService } from './embedder.service';
import { MemoryDigestService } from './memory-digest.service';
import { CorrectionsService } from './corrections.service';

@Module({
  providers: [ModesService, EmbedderService, MemoryService, MemoryLearnerService, MemoryDigestService, CorrectionsService],
  exports: [ModesService, MemoryService, MemoryLearnerService, MemoryDigestService, CorrectionsService],
})
export class MemoryModule {}
