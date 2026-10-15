import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_CONFIG, loadConfig } from './config';
import { ConversationModule } from './conversation/conversation.module';
import { ControlPanelModule } from './control-panel/control-panel.module';
import { FaceModule } from './face/face.module';
import { SoulModule } from './soul/soul.module';
import { WebModule } from './web/web.module';
import { LocationModule } from './location/location.module';
import { ModelsModule } from './models/models.module';
import { DeviceModule } from './device/device.module';
import { UpdatesModule } from './updates/updates.module';
import { LockModule } from './lock/lock.module';
import { StaffModule } from './staff/staff.module';
import { CareAppModule } from './care-app/care-app.module';

@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), LockModule, StaffModule, CareAppModule, ModelsModule, DeviceModule, UpdatesModule, SoulModule, LocationModule, WebModule, FaceModule, ConversationModule, ControlPanelModule],
  providers: [{ provide: APP_CONFIG, useFactory: loadConfig }],
  exports: [APP_CONFIG],
})
export class AppModule {}
