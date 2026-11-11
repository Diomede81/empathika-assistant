import { Global, Module } from '@nestjs/common';
import { MemoryModule } from '../memory/memory.module';
import { ClinicalService } from './clinical.service';

/** Global: the action router, the screen, the backup and the control panel use the doctor's notes. */
@Global()
@Module({ imports: [MemoryModule], providers: [ClinicalService], exports: [ClinicalService] })
export class ClinicalModule {}
