import { Global, Module } from '@nestjs/common';
import { MemoryModule } from '../memory/memory.module';
import { CareAppService } from './care-app.service';
import { MemoryBackupService } from './memory-backup.service';
import { FamilyUpdatesService } from './family-updates.service';

/** Global: the action router, the screen, the memory and the control panel all use the care app. */
@Global()
@Module({ imports: [MemoryModule], providers: [CareAppService, MemoryBackupService, FamilyUpdatesService], exports: [CareAppService, MemoryBackupService, FamilyUpdatesService] })
export class CareAppModule {}
