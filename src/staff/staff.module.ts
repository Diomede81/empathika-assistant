import { Global, Module } from '@nestjs/common';
import { MemoryModule } from '../memory/memory.module';
import { StaffService } from './staff.service';

/** Global: the screen's keypad, the voice actions, the care-app connector and the control panel all use it. */
@Global()
@Module({ imports: [MemoryModule], providers: [StaffService], exports: [StaffService] })
export class StaffModule {}
