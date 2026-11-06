import { Global, Module } from '@nestjs/common';
import { MemoryModule } from '../memory/memory.module';
import { ActivitiesService } from './activities.service';

/** Global: the action router, the screen, the backup and the control panel use it. */
@Global()
@Module({ imports: [MemoryModule], providers: [ActivitiesService], exports: [ActivitiesService] })
export class ActivitiesModule {}
