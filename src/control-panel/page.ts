/** HTML for the control panel. Server-rendered, no external assets, works on a phone. */
import { MODELS_CSS, modelsSection, PanelModels } from './models-page';
import { PanelScreen, SCREEN_CSS, screenSection } from './screen-page';

export interface PanelFact {
  id: string;
  kind: string;
  subject?: string;
  text: string;
  source: string;
  unverified?: boolean;
  date?: string;
  expiresAt?: string;
  updatedAt: string;
  createdAt: string;
  sharedAt?: string;
}

export interface PanelData {
  voice: string;
  /** Running on the Empathika box: the Device section can turn it off or restart it. */
  onBox?: boolean;
  device?: { volume?: number; brightness: number; brightnessSupported?: boolean };
  updates?: {
    onBox: boolean;
    version?: { sha: string; date: string; subject: string; repo: string };
    state?: { state: string; message: string; at: number };
    available?: { behind: number; changes: string[]; error?: string };
    auto: { auto: boolean; time: string };
  };
  models?: PanelModels;
  /** The start-up code (6 digits typed on Empathika's screen each time she starts). */
  lock?: { enabled: boolean; locked: boolean; canReset: boolean };
  /** The round screen's glance and photo frame (when the face is on). */
  screen?: PanelScreen;
  /** The tab to open first (overview, resident, family, staff, empathika, connections, settings). */
  tab?: string;
  notice?: { kind: 'ok' | 'error'; text: string };
  careApp: {
    configured: boolean;
    connected: boolean;
    error?: string;
    url?: string;
    residentId: string;
    backup: { available: boolean; minutes: number; lastBackupAt?: string; lastError?: string; lastRestore?: string };
    family: { minutes: number; lastCheckAt?: string; lastError?: string };
  };
  staff?: {
    list: { id: string; name: string; role?: string; badge: boolean; createdAt: string }[];
    audit: { at: string; staff?: string; event: string; detail?: string }[];
    session?: string;
    sessionMinutes: number;
  };
  web?: { configured: boolean; connected: boolean; remainingCredits?: number; error?: string };
  location?: { place: string; postcode?: string; country: string; countries: Record<string, string> };
  servers: { name: string; connected: boolean; offered: number; total: number; error?: string }[];
  soul?: { docs: Record<string, string>; doc: string; maxChars: number; journal?: { id: string; at: string; text: string; source: string }[] };
  memory?: {
    mode: string;
    modeText: string;
    vaults: {
      name: string;
      status: string;
      error?: string;
      facts: PanelFact[];
      notes: { id: string; at: string; summary: string; level?: string; from?: string }[];
      totalNotes: number;
    }[];
    family: PanelFact[];
    autoLearn: boolean;
    passwordSet: boolean;
    selected?: string;
    query?: string;
    activity: { at: string; kind: string; what: string; vaults?: string[]; items?: string[] }[];
  };
}

const VAULT_LABEL: Record<string, string> = { resident: 'Resident', care: 'Care (staff only)' };
const SOURCE: Record<string, string> = {
  you: 'checked (told to Empathika by staff, or asked to remember)',
  conversation: 'learnt in conversation',
  panel: 'added or confirmed here',
  family: 'from family',
  app: 'from the care app',
};
const KIND_LABEL: Record<string, string> = {
  person: 'person', life_story: 'life story', preference: 'likes & dislikes', routine: 'routine', date: 'date', health: 'health', family_news: 'family news', fact: 'other',
};
const FACTS_SHOWN = 60;
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const hidden = (name: string, value: string) => `<input type="hidden" name="${name}" value="${esc(value)}">`;
const post = (action: string, fields: Record<string, string>, label: string, cls = 'btn secondary') =>
  `<form method="post" action="${action}">${Object.entries(fields).map(([k, v]) => hidden(k, v)).join('')}<button class="${cls}" type="submit">${label}</button></form>`;

const SOUL_TABS: [string, string, string][] = [
  ['soul', 'Who Empathika is', 'Her identity and personality, adapted to this resident. Write it as Empathika ("I\'m Empathika…").'],
  ['resident', 'With the resident', 'How she behaves with the resident and visitors (the normal mode). She never discusses care details here.'],
  ['staff', 'With staff', 'How she behaves in a staff session, when she can read the care notes and the care record.'],
];

function soulSection(s: NonNullable<PanelData['soul']>): string {
  const [doc, , help] = SOUL_TABS.find((t) => t[0] === s.doc) ?? SOUL_TABS[0];
  const tabs = SOUL_TABS.map(([d, name]) => `<a class="tab ${d === doc ? 'on' : ''}" href="/?doc=${d}#soul">${name}</a>`).join('');
  const journal = s.journal
    ? s.journal.length
      ? s.journal
          .map((e) => `<li class="row"><div><div>${esc(e.text)}</div><div class="meta">${esc(day(e.at))} · ${e.source === 'panel' ? 'added here' : 'Empathika noted this'}</div></div>${post('/soul/journal-delete', { id: e.id }, 'Forget')}</li>`)
          .join('')
      : '<li class="empty">Nothing yet. After conversations, Empathika notes what shapes her relationship with the resident: a name they call her, a song they love, how they like her to talk.</li>'
    : '';
  return `<section id="soul"><h2>Empathika's personality</h2>
<div class="tabs">${tabs}</div>
<p class="meta">${esc(help)} Notes between <code>&lt;!--</code> and <code>--&gt;</code> are for you and hidden from her.</p>
<form method="post" action="/soul/save">${hidden('doc', doc)}<textarea name="text" rows="${doc === 'soul' ? 22 : 10}" maxlength="${s.maxChars}" spellcheck="true" aria-label="${esc(doc)}">${esc(s.docs[doc] ?? '')}</textarea>
<div class="acts" style="margin-top:8px"><button class="btn" type="submit">Save</button></div></form>
<form class="addfact danger" method="post" action="/soul/reset">${hidden('doc', doc)}<label class="meta"><input type="checkbox" name="confirm" value="yes"> Go back to the starter version of this page (your text is replaced)</label><button class="btn secondary" type="submit">Reset</button></form>
${s.journal ? `<h3>Empathika's journal</h3><p class="meta">What Empathika has learnt about being with this resident. Encrypted like her memory, and backed up to the care app.</p><ul>${journal}</ul>
<form class="addfact" method="post" action="/soul/journal-add"><input name="text" maxlength="240" required placeholder="e.g. Margaret likes to be called Peggy and loves singing 'We'll Meet Again'"><button class="btn secondary" type="submit">Add</button></form>` : ''}
</section>`;
}

function lockRow(l: NonNullable<PanelData['lock']>): string {
  const code = (name: string, label: string) =>
    `<input name="${name}" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" minlength="6" required autocomplete="off" placeholder="${label}" style="width:9em">`;
  const status = l.enabled ? (l.locked ? ' <span class="badge warn">Locked now</span>' : '') : '';
  return `<li class="row"><div style="width:100%"><div class="name">Start-up code ${badge(l.enabled, 'On', 'Off')}${status}</div>
<div class="meta">${l.enabled
    ? 'Every time Empathika starts, she stays locked until this 6-digit code is typed on her screen: she won\'t answer, act or show anything personal. You can also lock her from her screen menu (hold a finger on the screen for 2 seconds).'
    : 'Set a 6-digit code and Empathika will ask for it on her screen every time she starts. Until it is entered she won\'t answer, act or show anything personal.'}</div>
${l.enabled
    ? `<form class="addfact" method="post" action="/lock/set">${code('current', 'Current code')}${code('code', 'New code')}${code('repeat', 'Repeat new code')}<button class="btn" type="submit">Change</button></form>
<form class="addfact" method="post" action="/lock/off">${code('current', 'Current code')}<button class="btn secondary" type="submit">Turn off</button></form>
${l.canReset
    ? `<form class="addfact danger" method="post" action="/lock/reset"><label class="meta"><input type="checkbox" name="confirm" value="yes"> Forgot the code? Remove it (you signed in to this page with its password)</label><button class="btn secondary" type="submit">Remove code</button></form>`
    : '<p class="meta">Forgot the code? Set <code>PANEL_PASSWORD</code> to be able to remove it from this page, or delete <code>data/startup-code.json</code> on the box.</p>'}`
    : `<form class="addfact" method="post" action="/lock/set">${code('code', 'New 6-digit code')}${code('repeat', 'Repeat it')}<button class="btn" type="submit">Turn on</button></form>`}
</div></li>`;
}

function locationSection(l: NonNullable<PanelData['location']>): string {
  const opts = Object.entries(l.countries)
    .concat(l.countries[l.country] ? [] : [[l.country, l.country]])
    .map(([code, name]) => `<option value="${esc(code)}" ${code === l.country ? 'selected' : ''}>${esc(name)}</option>`)
    .join('');
  return `<section id="location"><h2>Care home location</h2>
<p class="meta">Where the care home is, so "what's the weather?" or "what's on nearby?" are answered for the right place. ${l.place ? '' : '<b>Not set yet.</b>'}</p>
<form class="stack" method="post" action="/location">
<div class="addfact"><input name="place" maxlength="100" required value="${esc(l.place)}" placeholder="Town, city or area, e.g. Hove, Brighton"></div>
<div class="addfact"><input name="postcode" maxlength="10" value="${esc(l.postcode ?? '')}" placeholder="Postcode (optional, e.g. SW4 or SW4 7AB)"><select name="country" aria-label="Country">${opts}</select><button class="btn" type="submit">Save</button></div>
</form><p class="meta">Kept encrypted with Empathika's memory; the postcode is never said out loud.</p></section>`;
}

function updatesSection(u: NonNullable<PanelData['updates']>): string {
  if (!u.onBox) return '<section id="updates"><h2>Updates</h2><p class="meta">One-click updates work when Empathika runs on the Empathika box (Raspberry Pi).</p></section>';
  const v = u.version;
  const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const busy = u.state && ['checking', 'updating', 'rebooting'].includes(u.state.state);
  const state = u.state
    ? `<p class="${u.state.state === 'failed' ? 'hint' : 'meta'}">${busy ? '<span class="badge warn">in progress</span> ' : ''}${esc(u.state.message)} <span class="meta">(${esc(when(new Date(u.state.at).toISOString()))})</span></p>`
    : '';
  const a = u.available;
  const list = a && !a.error && a.behind
    ? `<p><b>${a.behind} new change${a.behind === 1 ? '' : 's'} available:</b></p><ul class="items">${a.changes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`
    : a?.error
      ? `<p class="hint">${esc(a.error)}</p>`
      : a
        ? '<p class="meta">Empathika is up to date.</p>'
        : '';
  return `<section id="updates"><h2>Updates</h2>
<p class="meta">Installed: ${v ? `<b>${esc(v.subject)}</b> · ${esc(when(v.date))} · <code>${esc(v.sha.slice(0, 7))}</code>` : 'unknown (run the setup on the box once)'}</p>
${state}${busy ? '<span data-updating></span><p class="meta">Empathika restarts during the update: this page comes back by itself.</p>' : list}
<div class="acts" style="margin:12px 0">${!busy && a && a.behind ? '<form method="post" action="/updates/install"><button class="btn" type="submit">Update now</button></form>' : ''}
${busy ? '' : '<form method="post" action="/updates/check"><button class="btn secondary" type="submit">Check again</button></form>'}</div>
<form class="addfact" method="post" action="/updates/auto"><label class="meta"><input type="checkbox" name="auto" value="yes" ${u.auto.auto ? 'checked' : ''}> Install updates automatically at</label><input type="time" name="time" value="${esc(u.auto.time)}"><button class="btn secondary" type="submit">Save</button></form>
<p class="meta">New versions come from GitHub (${esc(v?.repo || 'your repository')}): merge a change there and it shows up here. Your settings, keys and Empathika's memory stay as they are.</p></section>`;
}

const ACTIVITY: Record<string, string> = {
  shared: 'Shared with AI', recall: 'Searched', saved: 'Saved', updated: 'Updated', forgot: 'Forgot', moved: 'Moved',
  note: 'Filed', digest: 'Digest', mode: 'Access', blocked: 'Refused',
};
const time = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const noteWhen = (n: { at: string; level?: string; from?: string }) =>
  n.level === 'month'
    ? new Date(n.from ?? n.at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) + ' · monthly digest'
    : n.level === 'week'
      ? `Week of ${day(n.from ?? n.at)} · weekly digest`
      : day(n.at);

function activitySection(a: NonNullable<PanelData['memory']>['activity']): string {
  const rows = a.length
    ? a
        .map(
          (e) => `<li class="row"><div><div><b>${esc(ACTIVITY[e.kind] ?? e.kind)}</b> · ${esc(e.what)}${e.vaults?.length ? ` <span class="meta">(${esc(e.vaults.join(', '))})</span>` : ''}</div>
<div class="meta">${esc(time(e.at))}</div>${e.items?.length ? `<details><summary class="meta">${e.items.length} memor${e.items.length === 1 ? 'y' : 'ies'}</summary><ul class="items">${e.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></details>` : ''}</div></li>`,
        )
        .join('')
    : '<li class="empty">Nothing yet.</li>';
  return `<section id="activity"><h2>Memory activity · last 30 days</h2>
<p class="meta">Which memories were shared with the AI service, searched, saved or changed, and staff sessions. Encrypted like the vaults.</p>
<ul>${rows}</ul><div class="acts" style="margin-top:12px">${post('/activity/clear', {}, 'Clear activity log')}</div></section>`;
}


function factRow(f: PanelFact, vault: string, others: string): string {
  const checked = f.source !== 'conversation';
  return `<li class="row"><div><div>${esc(f.text)}${f.unverified ? ' <span class="badge warn">unverified</span>' : ''}${checked ? ' <span class="badge ok">checked</span>' : ''}</div>
<div class="meta">${esc(KIND_LABEL[f.kind] ?? f.kind)}${f.subject ? ` · ${esc(f.subject)}` : ''} · ${esc(SOURCE[f.source] ?? f.source)} · ${esc(day(f.updatedAt))}${f.expiresAt ? ` · until ${esc(day(f.expiresAt))}` : ''}${f.unverified ? ' · saved right after Empathika read web pages: check it' : ''}</div></div>
<div class="acts">${f.unverified || !checked ? post('/memory/confirm', { id: f.id, vault }, 'Confirm') : ''}
<form method="post" action="/memory/move" class="move">${hidden('id', f.id)}${hidden('vault', vault)}<select name="to" aria-label="Move to">${others}</select><button class="btn secondary" type="submit">Move</button></form>
${post('/memory/delete', { id: f.id, vault }, 'Forget')}</div></li>`;
}

function memorySection(m: NonNullable<PanelData['memory']>): string {
  const sel = m.selected ?? 'resident';
  const q = (m.query ?? '').toLowerCase();
  const v = m.vaults.find((x) => x.name === sel) ?? m.vaults[0];
  const tabs = m.vaults
    .map((x) => `<a class="tab ${x.name === sel ? 'on' : ''}" href="/?vault=${x.name}#memory">${VAULT_LABEL[x.name] ?? x.name} <span class="meta">${x.status === 'open' ? x.facts.length : '!'}</span></a>`)
    .join('');
  const shown = v.facts.filter((f) => f.kind !== 'family_news' && (!q || f.text.toLowerCase().includes(q) || (f.subject ?? '').toLowerCase().includes(q)));
  const others = m.vaults.filter((x) => x.name !== v.name).map((x) => `<option value="${x.name}">${VAULT_LABEL[x.name] ?? x.name}</option>`).join('');
  const facts =
    v.status !== 'open'
      ? `<li class="hint">This vault ${esc(v.error ?? 'cannot be opened')}. Check <code>MEMORY_KEY</code> in <code>.env</code>.</li>`
      : shown.length
        ? shown.slice(0, FACTS_SHOWN).map((f) => factRow(f, v.name, others)).join('') +
          (shown.length > FACTS_SHOWN ? `<li class="empty">${shown.length - FACTS_SHOWN} more: use search to find them.</li>` : '')
        : `<li class="empty">${q ? 'Nothing matches.' : v.name === 'care' ? 'No care notes yet. Empathika files health and wellbeing observations here; staff can add notes below.' : 'Nothing yet. Add what you know about the resident below: family, life story, likes and routines.'}</li>`;
  const notes = v.notes.length
    ? v.notes.map((n) => `<li class="row"><div><div>${esc(n.summary)}</div><div class="meta">${esc(noteWhen(n))}</div></div>${post('/memory/delete', { id: n.id, type: 'note', vault: v.name }, 'Forget')}</li>`).join('')
    : `<li class="empty">${m.autoLearn ? 'Empathika files a short note after each conversation worth remembering.' : 'Conversation notes are off (MEMORY_AUTO_LEARN=off).'}</li>`;
  const kinds = (v.name === 'care' ? ['health', 'routine', 'preference', 'fact'] : ['person', 'life_story', 'preference', 'routine', 'date', 'fact'])
    .map((k) => `<option value="${k}">${KIND_LABEL[k]}</option>`)
    .join('');
  return `<section id="memory"><h2>What Empathika knows about the resident</h2>
${m.passwordSet ? '' : '<p class="hint">Anyone who can open this page can read the resident\'s memory, including care notes. Set <code>PANEL_PASSWORD</code> in <code>.env</code> and restart Empathika.</p>'}
<p class="meta">${esc(m.modeText)}. <b>Resident</b>: who they are, used in every conversation. <b>Care</b>: health and wellbeing notes, only ever read in a staff session. Facts marked <span class="badge ok">checked</span> came from staff, family or this page: what the resident says never overwrites them.</p>
<div class="tabs">${tabs}</div>
<form class="search" method="get" action="/#memory">${hidden('vault', v.name)}<input name="q" value="${esc(m.query ?? '')}" placeholder="Search ${esc(VAULT_LABEL[v.name] ?? v.name)}…"><button class="btn secondary" type="submit">Search</button></form>
<ul>${facts}</ul>
<form class="addfact wrap" method="post" action="/memory/add">${hidden('vault', v.name)}<input name="fact" maxlength="300" required placeholder="${v.name === 'care' ? 'e.g. Has had a cough since Monday; GP informed' : 'e.g. Margaret has two children, Sarah (lives in Leeds) and Tom'}"><input name="subject" maxlength="60" placeholder="About (optional), e.g. Sarah (daughter)" style="flex:0 1 14em"><select name="kind" aria-label="Kind">${kinds}</select><button class="btn" type="submit">Remember</button></form>
<p class="meta">Each vault is encrypted separately on the box, and backed up to the care app. Passwords, PINs and codes are never stored.</p></section>
<section><h2>${esc(VAULT_LABEL[v.name] ?? v.name)} · conversation notes${v.totalNotes > v.notes.length ? ` (latest ${v.notes.length} of ${v.totalNotes}; Empathika can search them all)` : ''}</h2><ul>${notes}</ul>
<p class="meta">Older notes are rolled up into weekly, then monthly digests automatically.</p></section>
${activitySection(m.activity)}`;
}

function familySection(m: NonNullable<PanelData['memory']>, app: PanelData['careApp']): string {
  const rows = m.family.length
    ? m.family
        .slice(0, 50)
        .map(
          (f) => `<li class="row"><div><div><b>${esc(f.subject ?? 'Family')}</b> · ${esc(f.text)}</div>
<div class="meta">${esc(when(f.createdAt))} · ${f.sharedAt ? `passed on ${esc(when(f.sharedAt))}` : '<span class="warntext">not passed on yet</span>'}</div></div>${post('/memory/delete', { id: f.id, vault: 'resident' }, 'Remove')}</li>`,
        )
        .join('')
    : '<li class="empty">No messages yet.</li>';
  const status = !app.configured
    ? 'The care app is not connected, so messages can\'t arrive yet (see Connections).'
    : `Checked every ${app.family.minutes} minute${app.family.minutes === 1 ? '' : 's'}${app.family.lastCheckAt ? ` · last check ${esc(when(app.family.lastCheckAt))}` : ''}${app.family.lastError ? ` · <span class="warntext">${esc(app.family.lastError)}</span>` : ''}.`;
  return `<section id="family"><h2>News from the family</h2>
<p class="meta">Relatives send WhatsApp messages and photos to the Empathika app; Empathika fetches them, tells the resident (on screen, and in conversation), and remembers them so she can answer "any news from Sarah?". Photos go to the evening photo frame. Messages marked sensitive in the app go to staff only. ${status}</p>
<div class="acts" style="margin:0 0 12px">${app.connected ? post('/family/check', {}, 'Check for messages now') : ''}</div>
<ul>${rows}</ul></section>`;
}

const AUDIT_LABEL: Record<string, string> = {
  session_start: 'Signed in', session_end: 'Signed out', session_expired: 'Session timed out', wrong_pin: 'Wrong PIN', paused: 'Keypad paused',
  care_record: 'Care record', care_memory: 'Care notes', staff_added: 'Staff added', staff_removed: 'Staff removed', memory_restore: 'Memory restored',
};

function staffSection(s: NonNullable<PanelData['staff']>): string {
  const rows = s.list.length
    ? s.list
        .map((x) => `<li class="row"><div><div class="name">${esc(x.name)}${x.role ? ` <span class="meta">· ${esc(x.role)}</span>` : ''}${x.badge ? ' <span class="badge ok">badge</span>' : ''}</div><div class="meta">Added ${esc(day(x.createdAt))}</div></div>
<form method="post" action="/staff/remove" onsubmit="return confirm('Remove ${esc(x.name)}? Their PIN stops working.')">${hidden('id', x.id)}<button class="btn secondary" type="submit">Remove</button></form></li>`)
        .join('')
    : '<li class="empty">No staff yet. Until someone is added, anyone can turn the box off or change its WiFi from the screen, and nobody can open the care record.</li>';
  const audit = s.audit.length
    ? s.audit
        .map((a) => `<li class="row"><div><div><b>${esc(AUDIT_LABEL[a.event] ?? a.event)}</b>${a.staff ? ` · ${esc(a.staff)}` : ''}${a.detail ? ` <span class="meta">${esc(a.detail)}</span>` : ''}</div><div class="meta">${esc(when(a.at))}</div></div></li>`)
        .join('')
    : '<li class="empty">Nothing yet.</li>';
  return `<section id="staff"><h2>Staff</h2>
<p class="meta">Each member of staff has their own 4-digit PIN. On Empathika's screen (hold a finger on it for 2 seconds → Staff, or say "Empathika, staff mode") the PIN opens a staff session for ${s.sessionMinutes} minutes: Empathika can then read the care notes and look things up in the care record. Turning the box off, restarting and WiFi also need a staff session. After 5 wrong PINs the keypad pauses. ${s.session ? `<b>Now: ${esc(s.session)}.</b>` : ''}</p>
<ul>${rows}</ul>
<form class="addfact wrap" method="post" action="/staff/add"><input name="name" maxlength="60" required placeholder="Name, e.g. Jane Smith"><input name="role" maxlength="40" placeholder="Role, e.g. Nurse"><input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" required autocomplete="off" placeholder="4-digit PIN" style="flex:0 1 8em"><input name="badge" maxlength="40" placeholder="NFC badge id (optional)" style="flex:0 1 12em"><button class="btn" type="submit">Add</button></form>
<p class="meta">PINs are never shown again and are stored encrypted. NFC badges: an id entered here will work once a badge reader is fitted to the box.</p></section>
<section id="audit"><h2>Staff activity</h2><p class="meta">Every sign-in, wrong PIN and care-record lookup, newest first. Encrypted on the box.</p><ul>${audit}</ul></section>`;
}

function careAppSection(a: PanelData['careApp']): string {
  if (!a.configured) {
    return `<section id="care-app"><h2>Empathika care app</h2><ul><li class="row"><div><div class="name">Care app ${badge(false, '', 'Not set up')}</div>
<div class="meta">Set <code>EMPATHIKA_APP_MCP_URL</code>, <code>EMPATHIKA_APP_TOKEN</code> and <code>RESIDENT_ID</code> in <code>.env</code> and restart Empathika. The app provides the care record (for staff), news from the family, and the backup of Empathika's memory. For testing, run the practice app: <code>npm run mock-app</code> (docs/CARE-APP-MCP.md).</div></div></li></ul></section>`;
  }
  const b = a.backup;
  return `<section id="care-app"><h2>Empathika care app</h2><ul><li class="row"><div><div class="name">Care app ${badge(a.connected)}</div>
<div class="meta">${a.connected ? `Resident <code>${esc(a.residentId || 'not set')}</code> · ${esc(a.url ?? '')}` : esc(a.error ?? 'Not reachable')}</div></div></li>
<li class="row"><div><div class="name">Memory backup ${badge(b.available, 'Available', 'Not available')}</div>
<div class="meta">${b.lastBackupAt ? `Last backup ${esc(when(b.lastBackupAt))}` : 'No backup yet'}${b.minutes ? ` · every ${b.minutes} minutes when something changed` : ' · only when asked here'}${b.lastError ? ` · <span class="warntext">${esc(b.lastError)}</span>` : ''}${b.lastRestore ? `<br>Last restore: ${esc(b.lastRestore)}` : ''}<br>A new or repaired box restores the resident's memories from the app by itself.</div></div>
<div class="acts">${b.available ? post('/backup/now', {}, 'Back up now', 'btn') : ''}${a.connected ? `<form method="post" action="/backup/restore" onsubmit="return confirm('Add any memories from the app backup that are missing here? Nothing here is overwritten.')"><button class="btn secondary" type="submit">Restore from the app</button></form>` : ''}</div></li></ul></section>`;
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const badge = (ok: boolean, yes = 'Connected', no = 'Not connected') =>
  `<span class="badge ${ok ? 'ok' : 'off'}">${ok ? yes : no}</span>`;

const TABS: [string, string][] = [
  ['overview', 'Overview'],
  ['memory', 'Resident'],
  ['family', 'Family news'],
  ['staff', 'Staff'],
  ['empathika', 'Empathika'],
  ['connections', 'Connections'],
  ['settings', 'Settings'],
];

/** The front page: one tile per area with its status; each tile opens its tab. */
function overview(d: PanelData): string {
  const m = d.memory;
  const tile = (href: string, k: string, v: string, meta: string) =>
    `<a class="tile" href="${href}"><div class="k">${k}</div><div class="v">${v}</div><div class="meta">${meta}</div></a>`;
  const count = (name: string) => m?.vaults.find((v) => v.name === name)?.facts.filter((f) => f.kind !== 'family_news').length ?? 0;
  const unshared = m?.family.filter((f) => !f.sharedAt).length ?? 0;
  const tiles = [
    m ? tile('#tab-memory', 'Resident', `${count('resident')} thing${count('resident') === 1 ? '' : 's'} Empathika knows`, `${count('care')} care note${count('care') === 1 ? '' : 's'} (staff only)`) : '',
    m ? tile('#tab-family', 'Family news', `${m.family.length} message${m.family.length === 1 ? '' : 's'}`, unshared ? `<span class="warntext">${unshared} not passed on yet</span>` : 'All passed on') : '',
    d.staff ? tile('#tab-staff', 'Staff', `${d.staff.list.length} with a PIN`, d.staff.session ? esc(d.staff.session) : 'No staff session now') : '',
    tile('#care-app', 'Care app', d.careApp.configured ? badge(d.careApp.connected) : badge(false, '', 'Not set up'), d.careApp.backup.lastBackupAt ? `Backed up ${esc(when(d.careApp.backup.lastBackupAt))}` : 'Care record, family news and backup'),
    d.soul ? tile('#tab-empathika', 'Personality', "Empathika's soul", 'Who she is with the resident and with staff') : '',
    tile('#web', 'Web search', d.web?.configured ? badge(d.web.connected) : badge(false, '', 'Not set up'), 'Optional: news, facts, local information'),
    d.location ? tile('#location', 'Location', d.location.place ? esc(d.location.place) : badge(false, '', 'Not set'), 'For the weather and local answers') : '',
  ].join('');
  return `${m ? `<section id="mode"><h2>Right now</h2><div class="name">${esc(m.modeText)}</div>
<p class="meta">Resident mode is normal. A staff session (PIN on the screen) opens the care notes and the care record for a few minutes.</p>
${m.mode === 'staff' ? `<div class="modes">${post('/staff/end', {}, 'End the staff session')}</div>` : ''}</section>` : ''}
<div class="tiles">${tiles}</div>`;
}

export function renderPanel(d: PanelData): string {
  const servers = d.servers
    .map(
      (s) => `<li class="row"><div><div class="name">${esc(s.name)} ${badge(s.connected)}</div>
        <div class="meta">${s.connected ? `${s.offered} of ${s.total} actions available to Empathika` : esc(s.error ?? '')}</div></div></li>`,
    )
    .join('');

  const show: Record<string, boolean> = { overview: true, memory: Boolean(d.memory), family: Boolean(d.memory), staff: Boolean(d.staff), empathika: Boolean(d.soul), connections: true, settings: true };
  const attention: Record<string, boolean> = {
    connections: Boolean((d.careApp.configured && !d.careApp.connected) || d.careApp.backup.lastError || (d.web?.configured && !d.web.connected)),
    settings: Boolean(d.location && !d.location.place),
    memory: Boolean(d.memory?.vaults.some((v) => v.status !== 'open' || v.facts.some((f) => f.unverified))),
    family: Boolean(d.memory?.family.some((f) => !f.sharedAt)),
    staff: Boolean(d.staff && !d.staff.list.length),
  };

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Empathika Control Panel</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--text:#1b1f24;--muted:#5d6670;--line:#e3e6ea;--accent:#2f6fed;--ok:#1f8a4c;--okbg:#e5f5ec;--offbg:#eef0f2;--err:#b42318;--errbg:#fdecea}
@media (prefers-color-scheme:dark){:root{--bg:#111418;--card:#1a1e24;--text:#e8eaed;--muted:#9aa3ad;--line:#2b3138;--accent:#6e9bff;--ok:#5fd18f;--okbg:#173524;--offbg:#252a31;--err:#ff8a80;--errbg:#3a1d1b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px 48px}h1{font-size:22px;margin:0 0 4px}.sub{color:var(--muted);margin:0 0 20px}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:16px}
h2{font-size:15px;margin:0 0 12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
ul{list-style:none;margin:0;padding:0}.row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid var(--line)}
.row:first-child{border-top:0;padding-top:0}.app{display:flex;gap:12px;align-items:flex-start}.app img,.ph{width:32px;height:32px;border-radius:8px;flex:none;background:var(--offbg)}
.addfact,.search{display:flex;gap:8px;margin:12px 0 8px}.addfact input,.search input,select{flex:1;min-width:0;font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--text)}
select{flex:none}.modes,.tabs,.acts{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.acts{margin:0;flex:none}.move{display:flex;gap:6px}
.tab{padding:6px 12px;border:1px solid var(--line);border-radius:8px;text-decoration:none;color:var(--text)}.tab.on{border-color:var(--accent);color:var(--accent);font-weight:600}
.badge.warn{background:var(--errbg);color:var(--err)}.badge.imp{background:#fff4e0;color:#9a5b00}.warntext{color:var(--err)}
${MODELS_CSS}${SCREEN_CSS}
.wrap{flex-wrap:wrap}.level{align-items:center}.level label{width:84px;flex:none}.level input[type=range]{flex:1;accent-color:var(--accent)}.level span{width:44px;text-align:right}.edit{flex-wrap:wrap;margin:8px 0}summary{cursor:pointer}
h3{font-size:14px;margin:16px 0 8px}.stack{margin:12px 0}.stack .addfact{margin:6px 0}.danger{margin-top:20px;align-items:center;justify-content:space-between}
textarea{width:100%;font:15px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--text);resize:vertical;font-variant-ligatures:none}
input[type=date],input[type=time]{flex:none}details{margin-top:4px}.items{list-style:disc;padding-left:18px;color:var(--muted);font-size:13px}
.hint{border-top:1px solid var(--line);padding:12px 0;color:var(--err)}.group{padding:14px 0 2px}.group h3{margin:0}.group+.row{border-top:0}.add{margin:12px 0 0}
.name{font-weight:600}.meta{color:var(--muted);font-size:13px}.empty{color:var(--muted)}
.badge{display:inline-block;font-size:12px;font-weight:600;padding:1px 8px;border-radius:999px;margin-left:6px;vertical-align:1px}
.badge.ok{background:var(--okbg);color:var(--ok)}.badge.off{background:var(--offbg);color:var(--muted)}
.btn{flex:none;background:var(--accent);color:#fff;text-decoration:none;border:0;border-radius:8px;padding:8px 14px;font:inherit;font-weight:600;cursor:pointer}
.btn.secondary{background:transparent;color:var(--accent);border:1px solid var(--line)}
.notice{border-radius:10px;padding:10px 14px;margin-bottom:16px}.notice.ok{background:var(--okbg);color:var(--ok)}.notice.error{background:var(--errbg);color:var(--err)}
code{background:var(--offbg);padding:1px 5px;border-radius:5px;font-size:13px}a{color:var(--accent)}
form{margin:0}.top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
@media (max-width:520px){.row{flex-direction:column;align-items:stretch}.btn{text-align:center}.addfact{flex-wrap:wrap}.addfact input{flex-basis:100%}}
.nav{position:sticky;top:0;z-index:5;background:var(--bg);display:flex;gap:4px;overflow-x:auto;margin:0 -16px 16px;padding:8px 16px;border-bottom:1px solid var(--line);scrollbar-width:none}
.nav::-webkit-scrollbar{display:none}.nav a{flex:none;padding:8px 14px;border-radius:999px;text-decoration:none;color:var(--muted);font-weight:600}
.nav a:hover{color:var(--text)}.nav a.on{background:var(--accent);color:#fff}.nav .dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--err);margin-left:6px;vertical-align:2px}
section{scroll-margin-top:64px}.js .pane{display:none}.js .pane.on{display:block}.pane>h2.title{font-size:13px;margin:0 0 10px}
.jump{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px}.jump a{font-size:13px;padding:4px 10px;border:1px solid var(--line);border-radius:999px;text-decoration:none;color:var(--text)}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.tile{display:block;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;text-decoration:none;color:var(--text)}
.tile:hover{border-color:var(--accent)}.tile .k{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.04em;font-weight:600}.tile .v{font-weight:600;margin:4px 0 2px}
</style><script>document.documentElement.className='js'</script></head><body data-tab="${esc(TABS.some((t) => t[0] === d.tab) ? d.tab : 'overview')}"><main>
<div class="top"><div><h1>Empathika</h1><p class="sub">Voice: ${esc(d.voice)}</p></div>
<div class="acts"><form method="post" action="/refresh"><button class="btn secondary" type="submit">Refresh</button></form>${d.memory?.passwordSet ? '<form method="post" action="/logout"><button class="btn secondary" type="submit">Sign out</button></form>' : ''}</div></div>
<nav class="nav" aria-label="Sections">${TABS.filter(([id]) => show[id]).map(([id, name]) => `<a href="#tab-${id}" data-tab="${id}">${name}${attention[id] ? '<span class="dot" title="Needs attention"></span>' : ''}</a>`).join('')}</nav>
${d.notice ? `<div class="notice ${d.notice.kind}">${esc(d.notice.text)}</div>` : ''}

<div class="pane" id="tab-overview">${overview(d)}</div>

<div class="pane" id="tab-memory">${d.memory ? memorySection(d.memory) : ''}</div>

<div class="pane" id="tab-family">${d.memory ? familySection(d.memory, d.careApp) : ''}</div>

<div class="pane" id="tab-staff">${d.staff ? staffSection(d.staff) : ''}</div>

<div class="pane" id="tab-empathika">${d.soul ? soulSection(d.soul) : ''}</div>

<div class="pane" id="tab-connections">
${careAppSection(d.careApp)}
<section id="web"><h2>Web search</h2><ul><li class="row"><div><div class="name">Firecrawl ${d.web?.configured ? badge(d.web.connected) : '<span class="badge off">Not set up</span>'}</div>
<div class="meta">${!d.web?.configured ? 'Optional. Add <code>FIRECRAWL_API_KEY</code> to <code>.env</code> (free key at <a href="https://firecrawl.dev" target="_blank" rel="noopener">firecrawl.dev</a>) and restart Empathika: she can then look up news, facts and local information.' : d.web.connected ? `Empathika can search the web and read pages${d.web.remainingCredits !== undefined ? ` · ${d.web.remainingCredits.toLocaleString('en-GB')} credits left` : ''}` : esc(d.web.error ?? 'Not reachable')}</div></div></li></ul></section>
${servers ? `<section id="servers"><h2>Other MCP servers</h2><ul>${servers}</ul></section>` : ''}
<p class="meta">Actions that change the care record (adding a note…) always need a spoken "yes" first.</p>
</div>

<div class="pane" id="tab-settings">${d.location ? locationSection(d.location) : ''}
${d.screen ? screenSection(d.screen, esc) : ''}
${d.models ? modelsSection(d.models, esc) : ''}
<section id="device"><h2>Device</h2>
${d.device ? `<form class="addfact level" method="post" action="/device/level"><label class="meta" for="vol">Volume</label><input id="vol" type="range" name="volume" min="0" max="100" step="5" value="${d.device.volume ?? 50}" ${d.device.volume === undefined ? 'disabled' : ''} oninput="this.nextElementSibling.textContent=this.value+'%'" onchange="this.form.submit()"><span class="meta">${d.device.volume ?? '–'}%</span></form>
<form class="addfact level" method="post" action="/device/level"><label class="meta" for="bri">Brightness</label><input id="bri" type="range" name="brightness" min="5" max="100" step="5" value="${d.device.brightness}" ${!d.onBox || d.device.brightnessSupported === false ? 'disabled' : ''} oninput="this.nextElementSibling.textContent=this.value+'%'" onchange="this.form.submit()"><span class="meta">${d.device.brightness}%</span></form>
${d.device.volume === undefined ? '<p class="meta">The speaker volume can\'t be read: is the sound system running?</p>' : ''}${d.onBox && d.device.brightnessSupported === false ? "<p class=\"meta\">This screen doesn't let the Pi change its brightness.</p>" : ''}` : ''}
${d.onBox
  ? `<p class="meta">Turn the Empathika box off safely before unplugging it, or restart it. On the box itself this needs a staff session (hold a finger on the screen for 2 seconds). To turn it on again, press the power button on the Raspberry Pi.</p>
<form class="addfact danger" method="post" action="/device/power"><input type="hidden" name="action" value="reboot"><label class="meta"><input type="checkbox" name="confirm" value="yes"> Yes, restart Empathika now</label><button class="btn secondary" type="submit">Restart</button></form>
<form class="addfact danger" method="post" action="/device/power"><input type="hidden" name="action" value="poweroff"><label class="meta"><input type="checkbox" name="confirm" value="yes"> Yes, turn Empathika off now</label><button class="btn secondary" type="submit">Turn off</button></form>`
  : '<p class="meta">Turning off and restarting are available when Empathika runs on the Empathika box (Raspberry Pi).</p>'}
</section>
${d.updates ? updatesSection(d.updates) : ''}
<section id="security"><h2>Security</h2><ul><li class="row"><div><div class="name">Panel password ${badge(Boolean(d.memory?.passwordSet), 'On', 'Off')}</div>
<div class="meta">${d.memory?.passwordSet ? 'This page asks for a password.' : 'Anyone on the network can open this page, including the care notes. Set <code>PANEL_PASSWORD</code> in <code>.env</code> and restart Empathika.'}</div></div></li>
${d.lock ? lockRow(d.lock) : ''}
<li class="row"><div><div class="name">Voice</div><div class="meta">${esc(d.voice)}</div></div></li></ul></section></div>
</main>
<script>
(function () {
  var panes = [].slice.call(document.querySelectorAll('.pane'));
  var links = [].slice.call(document.querySelectorAll('.nav a'));
  function route() {
    var id = decodeURIComponent(location.hash.slice(1));
    var el = id && document.getElementById(id);
    var pane = el && (el.classList.contains('pane') ? el : el.closest('.pane'));
    if (!pane) pane = document.getElementById('tab-' + document.body.getAttribute('data-tab')) || panes[0];
    panes.forEach(function (p) { p.classList.toggle('on', p === pane); });
    links.forEach(function (a) { a.classList.toggle('on', a.getAttribute('href') === '#' + pane.id); });
    if (el && el !== pane) el.scrollIntoView(); else window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  route();
  // An update is running: Empathika restarts during it. Look every 10 s; reload when she's back.
  if (document.querySelector('[data-updating]')) {
    var down = false;
    setInterval(function () {
      fetch('/api/status', { cache: 'no-store' }).then(function (r) { if (r.ok && down) location.reload(); }).catch(function () { down = true; });
    }, 10000);
    setTimeout(function () { if (!down) location.reload(); }, 30000);
  }
  // Something is being prepared (website suggestions): look again shortly.
  if (document.querySelector('[data-wait]')) setTimeout(function () { location.reload(); }, 15000);
})();
</script></body></html>`;
}
