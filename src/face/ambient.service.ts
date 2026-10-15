import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_CONFIG, AppConfig } from '../config';
import { timeZone } from '../actions/clock';
import { SealedStore } from '../memory/sealed-store';
import { Weather, WeatherService } from '../weather/weather.service';

export interface Glance {
  weather?: { icon: string; temp: number; text: string; hi?: number; lo?: number; rain?: number };
  /** Evening photo frame: on now, with these pictures (served at /photos/<name>). */
  frame?: { photos: string[]; everySec: number };
}

export interface AmbientSettings {
  glance: boolean;
  frame: boolean;
  frameFrom: string;
  frameTo: string;
  frameEverySec: number;
  /** Live captions under the face: what Empathika heard and what she says. Off unless switched on. */
  captions: boolean;
}

const PHOTO_MAX = 15 * 1024 * 1024;
const PHOTO_EXT: Record<string, string> = { ffd8ff: 'jpg', '89504e': 'png', '524946': 'webp' };

/**
 * What the screen shows around Empathika's face when nothing is happening: the time and the
 * weather and, in the evening, a photo frame of the resident's own pictures (family photos
 * uploaded on the control panel).
 */
@Injectable()
export class AmbientService implements OnModuleInit {
  private readonly log = new Logger('Ambient');
  private readonly store: SealedStore<AmbientSettings>;
  settings: AmbientSettings = { glance: true, frame: false, frameFrom: '19:00', frameTo: '23:00', frameEverySec: 20, captions: false };
  private readonly photoDir: string;
  private photoList: { names: string[]; at: number } = { names: [], at: 0 };

  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    @Optional() private readonly weather?: WeatherService,
  ) {
    this.store = new SealedStore(cfg.memory.dir, 'screen');
    this.photoDir = join(cfg.memory.dir, 'photos');
  }

  onModuleInit(): void {
    try {
      this.settings = { ...this.settings, ...(this.store.load() ?? {}) };
    } catch {
      // defaults
    }
  }

  save(changes: Partial<AmbientSettings>): string {
    const t = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (changes.frameFrom !== undefined && !t.test(changes.frameFrom)) return 'Times must be like 19:00.';
    if (changes.frameTo !== undefined && !t.test(changes.frameTo)) return 'Times must be like 23:00.';
    if (changes.frameEverySec !== undefined) changes.frameEverySec = Math.max(5, Math.min(600, Math.round(changes.frameEverySec) || 20));
    this.settings = { ...this.settings, ...changes };
    this.store.save(this.settings).catch((err) => this.log.warn(`Could not save the screen settings: ${(err as Error).message}`));
    return 'Saved the screen settings.';
  }

  /** What's around the face right now. */
  glance(): Glance | undefined {
    if (!this.settings.glance && !this.settings.frame) return undefined;
    const w = this.weather?.now;
    const out: Glance = {};
    if (this.settings.glance) {
      if (w) out.weather = { icon: w.icon, temp: w.temp, text: w.text, hi: w.hi, lo: w.lo, rain: w.rain };
    }
    if (this.settings.frame && this.inFrameHours()) {
      if (Date.now() - this.photoList.at > 30_000) this.photoList = { names: this.photos().map((p) => p.name), at: Date.now() };
      const photos = this.photoList.names;
      if (photos.length) out.frame = { photos, everySec: this.settings.frameEverySec };
    }
    return out;
  }

  get weatherNow(): Weather | undefined {
    return this.weather?.now;
  }

  private inFrameHours(): boolean {
    const t = new Intl.DateTimeFormat('en-GB', { timeZone: timeZone(), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
    const { frameFrom: a, frameTo: b } = this.settings;
    return a <= b ? t >= a && t < b : t >= a || t < b;
  }

  // ---------- Photos for the frame ----------

  photos(): { name: string; size: number; at: number }[] {
    try {
      return readdirSync(this.photoDir)
        .filter((n) => /^[a-z0-9-]+\.(jpg|png|webp)$/.test(n))
        .map((n) => {
          const st = statSync(join(this.photoDir, n));
          return { name: n, size: st.size, at: st.mtimeMs };
        })
        .sort((a, b) => a.at - b.at);
    } catch {
      return [];
    }
  }

  /** Saves an uploaded picture (JPEG, PNG or WebP, up to 15 MB). Returns its name or an error. */
  addPhoto(data: Buffer): { name?: string; error?: string } {
    if (data.length > PHOTO_MAX) return { error: 'That picture is too large (15 MB at most).' };
    const ext = PHOTO_EXT[data.subarray(0, 3).toString('hex')];
    if (!ext || (ext === 'webp' && data.subarray(8, 12).toString() !== 'WEBP')) return { error: 'Only JPEG, PNG or WebP pictures.' };
    mkdirSync(this.photoDir, { recursive: true });
    const name = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}.${ext}`;
    writeFileSync(join(this.photoDir, name), data);
    this.photoList.at = 0;
    return { name };
  }

  removePhoto(name: string): boolean {
    if (!/^[a-z0-9-]+\.(jpg|png|webp)$/.test(name)) return false;
    try {
      unlinkSync(join(this.photoDir, name));
      this.photoList.at = 0;
      return true;
    } catch {
      return false;
    }
  }

  /** A photo's bytes and type, for the screen and the control panel (safe names only). */
  photo(name: string): { data: Buffer; type: string } | undefined {
    const m = /^[a-z0-9-]+\.(jpg|png|webp)$/.exec(name);
    if (!m) return undefined;
    try {
      return { data: readFileSync(join(this.photoDir, name)), type: m[1] === 'jpg' ? 'image/jpeg' : `image/${m[1]}` };
    } catch {
      return undefined;
    }
  }
}
