import { Global, Module } from '@nestjs/common';
import { MemoryModule } from '../memory/memory.module';
import { PeopleService } from './people.service';

/** Global: the action router, the screen, the backup and the control panel all use the people records. */
@Global()
@Module({ imports: [MemoryModule], providers: [PeopleService], exports: [PeopleService] })
export class PeopleModule {}
