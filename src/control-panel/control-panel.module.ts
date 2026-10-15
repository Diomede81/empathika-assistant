import { Module } from '@nestjs/common';
import { McpModule } from '../mcp/mcp.module';
import { MemoryModule } from '../memory/memory.module';
import { ControlPanelService } from './control-panel.service';

@Module({ imports: [McpModule, MemoryModule], providers: [ControlPanelService] })
export class ControlPanelModule {}
