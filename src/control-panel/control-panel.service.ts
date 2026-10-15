import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { WebService } from '../web/web.service';
import { COUNTRIES, LocationService } from '../location/location.service';
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { APP_CONFIG, AppConfig } from '../config';
import { McpServersService } from '../mcp/mcp-servers.service';
import { KINDS, Kind, MemoryService } from '../memory/memory.service';
import { ModesService, VaultName, VAULTS } from '../memory/modes.service';
import { PanelAuth } from './panel-auth';
import { CareAppService } from '../care-app/care-app.service';
import { MemoryBackupService } from '../care-app/memory-backup.service';
import { FamilyUpdatesService } from '../care-app/family-updates.service';
import { StaffService } from '../staff/staff.service';
import { ModelsService, Task, TASKS } from '../models/models.service';
import { requestPower } from '../face/power';
import { DeviceService } from '../device/device.service';
import { UpdatesService } from '../updates/updates.service';
import { AmbientService } from '../face/ambient.service';
import { LockService } from '../lock/lock.service';
import { PanelData, renderPanel } from './page';
import { SOUL_DOCS, SOUL_MAX_CHARS, SoulDoc, SoulService } from '../soul/soul.service';

/**
 * A small web page (default http://localhost:8099) for the care team: what Empathika knows about
 * the resident, family news, staff PINs and activity, her personality, and the care app
 * connection. Only reachable from this computer by default; set PANEL_PASSWORD.
 */
@Injectable()
export class ControlPanelService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('ControlPanel');
  private server?: Server;
  @Optional() @Inject(WebService) private readonly web?: WebService;
  @Optional() @Inject(LocationService) private readonly location?: LocationService;
  @Optional() @Inject(SoulService) private readonly soul?: SoulService;
  @Optional() @Inject(StaffService) private readonly staff?: StaffService;
  @Optional() @Inject(MemoryBackupService) private readonly backup?: MemoryBackupService;
  @Optional() @Inject(FamilyUpdatesService) private readonly family?: FamilyUpdatesService;
  @Optional() @Inject(ModelsService) private readonly models?: ModelsService;
  @Optional() @Inject(DeviceService) private readonly device?: DeviceService;
  @Optional() @Inject(UpdatesService) private readonly updates?: UpdatesService;
  @Optional() @Inject(AmbientService) private readonly ambient?: AmbientService;
  @Optional() @Inject(LockService) private readonly lock?: LockService;

  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly app: CareAppService,
    private readonly mcp: McpServersService,
    private readonly memory: MemoryService,
    private readonly modes: ModesService,
  ) {
    this.auth = new PanelAuth(cfg.controlPanel.password);
  }

  private readonly auth: PanelAuth;

  onModuleInit(): void {
    const { port, host, publicUrl } = this.cfg.controlPanel;
    this.server = createServer((req, res) => {
      this.handle(req, res).catch((err) => {
        this.log.error((err as Error).message);
        this.redirect(res, `/?error=${encodeURIComponent((err as Error).message)}`);
      });
    });
    this.server.on('error', (err) => this.log.error(`Control panel unavailable: ${err.message}`));
    this.server.listen(port, host, () => this.log.log(`Control panel: ${publicUrl}`));
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    // Stop other websites open in the browser from posting to the panel (e.g. planting a "memory").
    if (req.method === 'POST' && !sameOrigin(req)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' }).end('Forbidden');
      return;
    }
    // Password (PANEL_PASSWORD): everything except the login page needs a signed-in session.
    if (url.pathname === '/login') return this.auth.handleLogin(req, res, readForm);
    if (url.pathname === '/logout' && req.method === 'POST') return this.auth.logout(req, res);
    if (!this.auth.allowed(req)) {
      if (req.method === 'GET' && !url.pathname.startsWith('/api/')) return this.redirect(res, '/login');
      res.writeHead(401, { 'Content-Type': 'text/plain' }).end('Sign in first');
      return;
    }
    if (req.method === 'GET' && url.pathname === '/') return this.page(res, url);
    if (req.method === 'GET' && url.pathname === '/api/status') return this.json(res, await this.data());
    if (req.method === 'POST' && url.pathname === '/refresh') {
      await Promise.all([this.mcp.refreshAll(), this.web?.check()]);
      return this.redirect(res, '/?refreshed=1');
    }
    if (req.method === 'GET' && url.pathname === '/api/memory') {
      return this.json(res, this.memory.snapshot().map((v) => ({ ...v, items: v.items.map(({ vec, ...i }) => i), episodes: v.episodes.map(({ vec, ...e }) => e) })));
    }
    if (req.method === 'POST' && url.pathname.startsWith('/memory/')) return this.memoryAction(req, res, url.pathname.slice('/memory/'.length));
    if (req.method === 'POST' && url.pathname.startsWith('/soul/')) return this.soulAction(req, res, url.pathname.slice('/soul/'.length));
    if (req.method === 'POST' && url.pathname.startsWith('/updates/') && this.updates) {
      const f = await readForm(req);
      const u = this.updates;
      let msg: string;
      let ok = true;
      if (url.pathname === '/updates/install') {
        msg = u.request('control panel');
        ok = msg.startsWith('Updating');
      } else if (url.pathname === '/updates/auto') {
        msg = u.setAuto(f.get('auto') === 'yes', f.get('time') ?? undefined);
        ok = !msg.startsWith('The time');
      } else {
        const a = await u.check(true);
        msg = !a ? 'The installed version is unknown.' : a.error ?? (a.behind ? `${a.behind} new change${a.behind === 1 ? '' : 's'} available.` : 'Empathika is up to date.');
        ok = Boolean(a && !a.error);
      }
      return this.redirect(res, `/?${ok ? 'ok' : 'error'}=${encodeURIComponent(msg)}#updates`);
    }
    if (req.method === 'POST' && url.pathname === '/device/level' && this.device) {
      const f = await readForm(req);
      const out = f.has('volume') ? await this.device.setVolume(Number(f.get('volume'))) : this.device.setBrightness(Number(f.get('brightness')));
      const what = f.has('volume') ? 'Volume' : 'Brightness';
      return this.redirect(res, `/?${typeof out === 'number' ? `ok=${encodeURIComponent(`${what} ${out}%.`)}` : `error=${encodeURIComponent(out)}`}#device`);
    }
    if (req.method === 'POST' && url.pathname === '/device/power') {
      const f = await readForm(req);
      const action = f.get('action') === 'reboot' ? 'reboot' : 'poweroff';
      if (f.get('confirm') !== 'yes') return this.redirect(res, '/?error=Tick%20the%20box%20to%20confirm.#device');
      if (!requestPower(this.cfg, action)) return this.redirect(res, '/?error=Only%20available%20on%20the%20Empathika%20box.#device');
      this.log.log(action === 'reboot' ? 'Restarting (asked from the control panel)' : 'Turning off (asked from the control panel)');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(
        `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Empathika</title><body style="font:16px system-ui;margin:40px;max-width:520px">` +
          (action === 'reboot'
            ? '<h1>Restarting…</h1><p>Empathika will be back in about a minute. <a href="/">Open the control panel again</a>.</p>'
            : "<h1>Turning off</h1><p>When Empathika's screen goes dark it's safe to unplug. To turn her on again, press the power button on the Raspberry Pi.</p>"),
      );
      return;
    }
    if (req.method === 'POST' && url.pathname.startsWith('/models/') && this.models) {
      const f = await readForm(req);
      const task = (f.get('task') ?? '') as Task;
      if (!(task in TASKS)) return this.redirect(res, '/?error=Unknown%20job#models');
      const msg = url.pathname === '/models/test' ? await this.models.test(task) : this.models.assign(task, f.get('provider') ?? 'default', f.get('model') ?? '');
      const ok = !/failed|isn't set up|Choose|Unknown/.test(msg);
      return this.redirect(res, `/?${ok ? 'ok' : 'error'}=${encodeURIComponent(msg)}#models`);
    }
    if (req.method === 'POST' && url.pathname.startsWith('/staff/') && this.staff) return this.staffAction(req, res, url.pathname.slice('/staff/'.length));
    if (req.method === 'POST' && url.pathname === '/backup/now' && this.backup) {
      const r = await this.backup.backup(true);
      return this.redirect(res, `/?${r.ok ? 'ok' : 'error'}=${encodeURIComponent(r.message)}#care-app`);
    }
    if (req.method === 'POST' && url.pathname === '/backup/restore' && this.backup) {
      const r = await this.backup.restore();
      return this.redirect(res, `/?${r.ok ? 'ok' : 'error'}=${encodeURIComponent(r.message)}#care-app`);
    }
    if (req.method === 'POST' && url.pathname === '/family/check' && this.family) {
      const n = await this.family.check();
      const msg = this.family.lastError ? `Could not check: ${this.family.lastError}` : n ? `${n} new message${n === 1 ? '' : 's'}.` : 'No new messages.';
      return this.redirect(res, `/?${this.family.lastError ? 'error' : 'ok'}=${encodeURIComponent(msg)}#family`);
    }
    if (req.method === 'GET' && url.pathname === '/api/memory/activity') return this.json(res, this.memory.recentActivity(500));
    if (req.method === 'POST' && url.pathname === '/activity/clear') {
      this.memory.clearActivity();
      return this.redirect(res, '/?ok=Activity%20log%20cleared.#activity');
    }
    if (req.method === 'POST' && url.pathname.startsWith('/lock/') && this.lock) {
      const f = await readForm(req);
      const action = url.pathname.slice('/lock/'.length);
      let out: { ok: boolean; message: string };
      if (action === 'set') {
        out = f.get('code') !== f.get('repeat') ? { ok: false, message: 'The two new codes are different.' } : this.lock.setCode(f.get('code') ?? '', f.get('current') ?? '');
      } else if (action === 'off') {
        out = this.lock.setCode(undefined, f.get('current') ?? '');
      } else if (action === 'reset' && this.auth.enabled && f.get('confirm') === 'yes') {
        out = this.lock.setCode(undefined, undefined, true);
      } else {
        out = { ok: false, message: this.auth.enabled ? 'Tick the box to confirm.' : 'Removing a forgotten code needs a password on this page (PANEL_PASSWORD).' };
      }
      return this.redirect(res, `/?${out.ok ? 'ok' : 'error'}=${encodeURIComponent(out.message)}#security`);
    }
    if (url.pathname.startsWith('/screen/') && this.ambient) return this.screenAction(req, res, url.pathname.slice('/screen/'.length));
    if (req.method === 'POST' && url.pathname === '/location' && this.location) {
      const f = await readForm(req);
      const msg = await this.location.save({ place: f.get('place') ?? '', postcode: f.get('postcode') ?? '', country: f.get('country') ?? '' });
      return this.redirect(res, `/?${msg.startsWith('Saved') ? 'ok' : 'error'}=${encodeURIComponent(msg)}#location`);
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }

  private async modelsData(m: ModelsService): Promise<PanelData['models']> {
    const providers = await Promise.all(
      m.providers().map(async (p) => ({ ...p, ...(p.configured && p.id !== 'default' ? await m.available(p.id) : { models: [] as string[] }) })),
    );
    return {
      main: this.cfg.llm.model,
      providers,
      tasks: (Object.keys(TASKS) as Task[]).map((t) => ({ id: t, ...TASKS[t], ...m.assignment(t), describe: m.describe(t) })),
    };
  }

  private async soulAction(req: IncomingMessage, res: ServerResponse, action: string): Promise<void> {
    // The soul can be a page or two of text: allow a bigger form for it.
    const f = await readForm(req, SOUL_MAX_CHARS * 4 + 1024);
    const doc = (SOUL_DOCS.includes(f.get('doc') as SoulDoc) ? f.get('doc') : 'soul') as SoulDoc;
    const back = (msg: string, ok = true) => this.redirect(res, `/?${ok ? 'ok' : 'error'}=${encodeURIComponent(msg)}&doc=${doc}#soul`);
    if (!this.soul) return back('Not available.', false);
    switch (action) {
      case 'save': {
        const msg = this.soul.save(f.get('text') ?? '', doc);
        return back(msg, msg.startsWith('Saved'));
      }
      case 'reset':
        if (f.get('confirm') !== 'yes') return back('Tick the box to confirm going back to the starter version.', false);
        this.soul.reset(doc);
        return back('Back to the starter version.');
      case 'journal-add':
        return this.soul.addEntry(f.get('text') ?? '', 'panel') ? back('Added to Empathika\'s journal.') : back('Nothing added (empty, or already there).', false);
      case 'journal-delete':
        return back(this.soul.removeEntry(f.get('id') ?? '') ? 'Removed from Empathika\'s journal.' : 'Could not find that entry.');
      default:
        res.writeHead(404).end();
    }
  }

  private async memoryAction(req: IncomingMessage, res: ServerResponse, action: string): Promise<void> {
    const f = await readForm(req);
    const id = f.get('id') ?? '';
    const vault = (VAULTS.includes(f.get('vault') as VaultName) ? f.get('vault') : 'resident') as VaultName;
    const back = (msg: string, ok = true) => this.redirect(res, `/?${ok ? 'ok' : 'error'}=${encodeURIComponent(msg)}&vault=${vault}#memory`);
    switch (action) {
      case 'add': {
        const kind = KINDS.includes(f.get('kind') as Kind) ? (f.get('kind') as Kind) : undefined;
        const r = await this.memory.remember({ text: f.get('fact') ?? '', vault, kind, subject: f.get('subject') || undefined, date: f.get('date') || undefined, source: 'panel' });
        return back(r.ok ? 'Saved to memory.' : r.message, r.ok);
      }
      case 'delete':
        if (f.get('type') === 'note') this.memory.deleteEpisode(id);
        else this.memory.deleteItem(id);
        return back('Removed from memory.');
      case 'move':
        return back(this.memory.moveItem(id, (f.get('to') as VaultName) ?? vault) ? 'Moved.' : 'Could not move that.');
      case 'confirm':
        return back(this.memory.confirmItem(id) ? 'Confirmed.' : 'Could not confirm that.');
      default:
        res.writeHead(404).end();
    }
  }

  /** Settings → Screen: the glance and photo frame settings, and the pictures. */
  private async screenAction(req: IncomingMessage, res: ServerResponse, action: string): Promise<void> {
    const a = this.ambient!;
    if (req.method === 'GET' && action.startsWith('photos/')) {
      const p = a.photo(action.slice('photos/'.length));
      if (!p) res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      else res.writeHead(200, { 'Content-Type': p.type, 'Cache-Control': 'private, max-age=86400' }).end(p.data);
      return;
    }
    if (req.method !== 'POST') return this.redirect(res, '/#screen');
    if (action === 'photo') {
      const data = await readBody(req, MAX_PHOTO_BYTES);
      const out = data ? a.addPhoto(data) : { error: 'That picture is too large (15 MB at most).' };
      if (out.name) this.log.log('Photo added for the screen');
      return this.json(res, out);
    }
    const f = await readForm(req);
    if (action === 'photo-delete') {
      const ok = a.removePhoto(f.get('name') ?? '');
      return this.redirect(res, `/?${ok ? 'ok=Picture%20removed.' : 'error=Picture%20not%20found.'}#screen`);
    }
    if (action === 'save') {
      const msg = a.save({
        glance: f.get('glance') === 'on',
        frame: f.get('frame') === 'on',
        captions: f.get('captions') === 'on',
        frameFrom: f.get('frameFrom') ?? '',
        frameTo: f.get('frameTo') ?? '',
        frameEverySec: Number(f.get('frameEverySec') ?? 20),
      });
      return this.redirect(res, `/?${msg.startsWith('Saved') ? 'ok' : 'error'}=${encodeURIComponent(msg)}#screen`);
    }
    return this.redirect(res, '/#screen');
  }

  private async staffAction(req: IncomingMessage, res: ServerResponse, action: string): Promise<void> {
    const f = await readForm(req);
    const back = (msg: string, ok = true) => this.redirect(res, `/?${ok ? 'ok' : 'error'}=${encodeURIComponent(msg)}#staff`);
    switch (action) {
      case 'add': {
        const r = this.staff!.add(f.get('name') ?? '', (f.get('pin') ?? '').trim(), f.get('role') ?? undefined, f.get('badge') ?? undefined);
        return back(r.message, r.ok);
      }
      case 'remove':
        return back(this.staff!.remove(f.get('id') ?? '') ? 'Removed. Their PIN no longer works.' : 'Not found.');
      case 'end':
        return back(this.modes.endStaff() ? 'Staff session ended.' : 'No staff session was open.');
      default:
        res.writeHead(404).end();
    }
  }

  private async data(): Promise<PanelData> {
    const rt = this.cfg.realtime;
    return {
      voice:
        this.cfg.voiceMode === 'realtime'
          ? `${rt.provider === 'gemini' ? 'Gemini Live' : 'OpenAI Realtime'} (${rt.model}, "${rt.voice}")`
          : `Pipeline (${this.cfg.llm.model})`,
      careApp: {
        configured: this.app.configured,
        connected: this.app.connected,
        error: this.app.lastError,
        url: this.cfg.app.mcpUrl || undefined,
        residentId: this.cfg.app.residentId,
        backup: { available: Boolean(this.backup?.available), minutes: this.cfg.app.backupMinutes, ...(this.backup?.status ?? {}) },
        family: { minutes: this.cfg.app.familyMinutes, lastCheckAt: this.family?.lastCheckAt, lastError: this.family?.lastError },
      },
      staff: this.staff && {
        list: this.staff.list(),
        audit: this.staff.auditLog(100),
        session: this.modes.staff ? this.modes.describe() : undefined,
        sessionMinutes: this.cfg.staff.sessionMinutes,
      },
      web: this.web?.status,
      location: this.location && { ...(this.location.home ?? { place: '', country: this.location.country }), countries: COUNTRIES },
      models: this.models && (await this.modelsData(this.models)),
      onBox: this.cfg.face.onBox,
      device: await this.device?.status(),
      lock: this.lock && this.cfg.face.enabled ? { enabled: this.lock.enabled, locked: this.lock.locked, canReset: this.auth.enabled } : undefined,
      screen: this.ambient && this.cfg.face.enabled
        ? { ...this.ambient.settings, photos: this.ambient.photos(), place: this.location?.home?.place || undefined }
        : undefined,
      updates: this.updates && {
        onBox: this.updates.onBox,
        version: this.updates.version(),
        state: this.updates.state(),
        available: this.updates.onBox ? await this.updates.check() : undefined,
        auto: this.updates.auto,
      },
      memory: this.memory.enabled
        ? {
            mode: this.modes.mode,
            modeText: this.modes.describe(),
            vaults: this.memory.snapshot().map((v) => ({
              name: v.name,
              status: v.status,
              error: v.error,
              facts: [...v.items].reverse(),
              notes: [...v.episodes].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10),
              totalNotes: v.episodes.length,
            })),
            family: this.memory.familyNews(),
            autoLearn: this.cfg.memory.autoLearn,
            passwordSet: this.auth.enabled,
            activity: this.memory.recentActivity(60),
          }
        : undefined,
      soul: this.soul && {
        docs: Object.fromEntries(SOUL_DOCS.map((d) => [d, this.soul!.read(d)])) as Record<SoulDoc, string>,
        doc: 'soul',
        maxChars: SOUL_MAX_CHARS,
        journal: this.memory.enabled ? this.soul.entries() : undefined,
      },
      servers: this.mcp.list.map((s) => ({
        name: s.config.name,
        connected: s.connected,
        ...s.counts,
        error: s.lastError,
      })),
    };
  }

  private async page(res: ServerResponse, url: URL): Promise<void> {
    const d = await this.data();
    if (url.searchParams.has('refreshed')) d.notice = { kind: 'ok', text: 'Refreshed.' };
    else if (url.searchParams.get('ok')) d.notice = { kind: 'ok', text: url.searchParams.get('ok')! };
    else if (url.searchParams.get('error')) d.notice = { kind: 'error', text: url.searchParams.get('error')! };
    if (d.memory) {
      d.memory.selected = (VAULTS.includes(url.searchParams.get('vault') as VaultName) ? url.searchParams.get('vault') : 'resident') as VaultName;
      d.memory.query = url.searchParams.get('q') ?? '';
    }
    if (d.soul && SOUL_DOCS.includes(url.searchParams.get('doc') as SoulDoc)) d.soul.doc = url.searchParams.get('doc') as SoulDoc;
    // Which tab opens first (a #section in the address, e.g. after saving, takes precedence in the browser).
    const q = url.searchParams;
    d.tab = q.get('tab') ?? (q.has('doc') ? 'empathika' : q.has('vault') || q.has('q') ? 'memory' : undefined);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(renderPanel(d));
  }

  private json(res: ServerResponse, body: unknown): void {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(body, null, 2));
  }

  private redirect(res: ServerResponse, to: string): void {
    if (res.headersSent) return;
    res.writeHead(302, { Location: to }).end();
  }

  onModuleDestroy(): void {
    this.server?.close();
  }
}

const MAX_FORM_BYTES = 16 * 1024;
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

async function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer | undefined> {
  const parts: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) return undefined;
    parts.push(chunk as Buffer);
  }
  return Buffer.concat(parts);
}

async function readForm(req: IncomingMessage, maxBytes = MAX_FORM_BYTES): Promise<URLSearchParams> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > maxBytes) throw new Error('Form too large');
  }
  return new URLSearchParams(body);
}

/** Browsers send Origin on form posts; it must be this panel's own address. */
function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return !req.headers['sec-fetch-site'] || req.headers['sec-fetch-site'] === 'same-origin';
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}
