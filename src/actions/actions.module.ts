import { Module } from '@nestjs/common';
import { McpModule } from '../mcp/mcp.module';
import { MemoryModule } from '../memory/memory.module';
import { BuiltinActionsService } from './builtin-actions.service';
import { TimerService } from './timer.service';
import { ToolRouterService } from './tool-router.service';
import { ConversationControl } from './conversation-control';
import { ScreenToolsService } from './screen-tools.service';

@Module({
  imports: [McpModule, MemoryModule],
  providers: [TimerService, BuiltinActionsService, ToolRouterService, ConversationControl, ScreenToolsService],
  exports: [TimerService, BuiltinActionsService, ToolRouterService, ConversationControl, ScreenToolsService, MemoryModule],
})
export class ActionsModule {}
