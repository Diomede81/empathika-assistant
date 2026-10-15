/**
 * Type to Empathika instead of talking: same AI model, same memory and care-app actions, no audio.
 *   npm run chat              (or: docker compose run --rm empathika chat)
 * Ideal for testing the care app connection, memory and family updates, and choosing an LLM
 * before the microphone/speaker setup is done. Add --speak to also hear the replies through Piper.
 * Type /staff 1234 to sign in as staff with that PIN, and /end to end the staff session.
 */
import 'reflect-metadata';
import { Global, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createInterface } from 'node:readline';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { APP_CONFIG, loadConfig } from '../config';
import { LlmModule } from '../llm/llm.module';
import { FaceModule } from '../face/face.module';
import { FaceService } from '../face/face.service';
import { LlmService, explainLlmError } from '../llm/llm.service';
import { CareAppService } from '../care-app/care-app.service';
import { StaffService } from '../staff/staff.service';
import { StaffModule } from '../staff/staff.module';
import { CareAppModule } from '../care-app/care-app.module';
import { ModelsModule } from '../models/models.module';
import { DeviceModule } from '../device/device.module';
import { LockModule } from '../lock/lock.module';
import { LocationModule } from '../location/location.module';
import { SoulModule } from '../soul/soul.module';
import { TimerService, announcement } from '../actions/timer.service';
import { TtsModule } from '../tts/tts.module';
import { TtsService } from '../tts/tts.service';
import { SentenceSplitter } from '../conversation/sentence-splitter';
import { MemoryService } from '../memory/memory.service';
import { ModesService } from '../memory/modes.service';
import { MemoryLearnerService, TranscriptLine } from '../memory/memory-learner.service';

try {
  process.loadEnvFile('.env');
} catch {
  // no .env: use defaults / shell environment
}

@Global()
@Module({
  // The face screen follows typing mode too (with --speak the mouth moves with the voice).
  imports: [ModelsModule, DeviceModule, LockModule, LocationModule, SoulModule, StaffModule, CareAppModule, LlmModule, TtsModule, FaceModule],
  providers: [{ provide: APP_CONFIG, useFactory: loadConfig }],
  exports: [APP_CONFIG],
})
class ChatModule {}

async function main(): Promise<void> {
  const speak = process.argv.includes('--speak');
  const app = await NestFactory.createApplicationContext(ChatModule, { logger: ['error', 'warn', 'log'] });
  const llm = app.get(LlmService);
  const tts = app.get(TtsService);
  const history: ChatCompletionMessageParam[] = [];
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  // Start buffering input immediately, so lines typed/pasted during start-up are not lost.
  const lines = rl[Symbol.asyncIterator]();

  app.get(TimerService).on('fired', (t) => {
    const text = announcement(t);
    if (t.say) face.said(text);
    else face.setEmotion('surprised', 5000);
    process.stdout.write(`\n*** ${text} ***\nYou: `);
    if (speak) {
      const s = tts.session();
      s.say(text);
      void s.done();
    }
  });
  const care = app.get(CareAppService);
  console.log(
    !care.configured
      ? '\nCare app: not set up (EMPATHIKA_APP_MCP_URL). Memory, reminders and conversation still work.'
      : care.connected
        ? '\nCare app: connected'
        : `\n!! Care app: NOT connected - ${care.lastError}`,
  );
  const face = app.get(FaceService);
  const memory = app.get(MemoryService);
  if (memory.enabled) {
    const vaults = memory.snapshot().map((v) => `${v.name} ${v.status === 'open' ? `${v.items.length} facts` : `(${v.error})`}`);
    console.log(`Memory: ${vaults.join(', ')}. ${app.get(ModesService).describe()}`);
  }
  const transcript: TranscriptLine[] = [];
  console.log('\nType to Empathika (e.g. "any news from my daughter?"). /staff 1234 signs in as staff, /end ends it. Empty line or Ctrl+C to quit.\n');

  rl.setPrompt('You: ');
  rl.prompt();
  for (;;) {
    const next = await lines.next();
    if (next.done) break;
    const text = String(next.value).trim();
    if (!text) break;
    const pin = /^\/staff\s+(\d{4})$/.exec(text);
    if (pin || text === '/end') {
      const modes = app.get(ModesService);
      if (pin) console.log(app.get(StaffService).unlockWithPin(pin[1]).message);
      else modes.endStaff();
      console.log(`(${modes.describe()})\n`);
      rl.prompt();
      continue;
    }
    history.push({ role: 'user', content: text });
    transcript.push({ who: 'user', text });
    let reply = '';
    const started = Date.now();
    let first = 0;
    const speech = speak ? tts.session() : undefined;
    face.setState('thinking');
    const splitter = new SentenceSplitter();
    process.stdout.write('Empathika: ');
    try {
      for await (const fragment of llm.respond(history)) {
        if (!first) first = Date.now();
        process.stdout.write(fragment);
        reply += fragment;
        for (const s of splitter.push(fragment)) {
          face.said(s);
          speech?.say(s);
        }
      }
    } catch (err) {
      const why = explainLlmError(err);
      process.stdout.write(`${why.spoken}\n      [${why.log}]`);
    }
    for (const s of splitter.flush()) {
      face.said(s);
      speech?.say(s);
    }
    console.log(`\n      (first words after ${first ? first - started : '-'} ms, total ${Date.now() - started} ms)\n`);
    if (reply.trim()) transcript.push({ who: 'empathika', text: reply.trim() });
    face.setState('idle');
    await speech?.done();
    rl.prompt();
  }
  rl.close();
  if (memory.enabled) {
    console.log('Filing this conversation in memory...');
    await app.get(MemoryLearnerService).learn(transcript);
    await memory.flush();
  }
  await app.close();
  process.exit(0);
}

void main();
