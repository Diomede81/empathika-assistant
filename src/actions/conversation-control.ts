import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';

/**
 * Lets the AI model end the current conversation (the end_conversation action): when the user
 * says they're done, or when what Empathika heard clearly wasn't said to her. The voice loops check it
 * after each reply and go quiet.
 */
@Injectable()
export class ConversationControl extends EventEmitter {
  private requested = false;
  private afterReply = false;

  /**
   * Starts a conversation without the wake word (a button on the screen, e.g. "Yes please" to a
   * puzzle): Empathika says `opening`, then listens. Only while she is idle and waiting for the wake
   * word; returns false otherwise (a voice loop answers through 'start').
   */
  requestStart(opening: string): boolean {
    let taken = false;
    this.emit('start', opening, () => (taken = true));
    return taken;
  }

  requestEnd(): void {
    this.requested = true;
  }

  /**
   * End once Empathika has answered (e.g. music just started: she confirms it in a few words, then goes
   * quiet so the user can listen, without having to say "stop").
   */
  requestEndAfterReply(): void {
    this.afterReply = true;
  }

  /** True once after end_conversation was called; resets itself. */
  consumeEnd(): boolean {
    const r = this.requested;
    this.requested = false;
    return r;
  }

  /** True once after requestEndAfterReply; resets itself. */
  consumeEndAfterReply(): boolean {
    const r = this.afterReply;
    this.afterReply = false;
    return r;
  }

  /** A new conversation: nothing left over from the last one. */
  reset(): void {
    this.requested = false;
    this.afterReply = false;
  }

  get endRequested(): boolean {
    return this.requested;
  }
}
