/**
 * A practice version of the Empathika care app, for trying everything before the real app exists:
 * the care record (staff questions), news from the family, and the memory backup. It speaks the
 * same MCP contract as the real app will (docs/CARE-APP-MCP.md), with one made-up resident.
 *
 *   npm run mock-app                 (http://localhost:8090, MCP at http://localhost:8090/mcp)
 *
 * Then in Empathika's .env:
 *   EMPATHIKA_APP_MCP_URL=http://localhost:8090/mcp      (from Docker: http://host.docker.internal:8090/mcp)
 *   EMPATHIKA_APP_TOKEN=practice
 *   RESIDENT_ID=res-001
 *
 * Open http://localhost:8090 to send a "WhatsApp" from a relative and see what Empathika fetched.
 * Its data is kept in data/mock-care-app.json. Not for real residents' data.
 */
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const PORT = Number(process.env.MOCK_APP_PORT ?? 8090);
const TOKEN = process.env.MOCK_APP_TOKEN ?? 'practice';
const FILE = process.env.MOCK_APP_FILE ?? 'data/mock-care-app.json';

interface Message {
  id: string;
  resident_id: string;
  from: string;
  relationship?: string;
  received_at: string;
  text: string;
  sensitive?: boolean;
  delivered_at?: string;
}

interface Store {
  residents: Record<string, Resident>;
  messages: Message[];
  backups: Record<string, { saved_at: string; backup: unknown }>;
  notes: { resident_id: string; at: string; by: string; text: string }[];
  /** The resident's family and friends, as staff recorded them (shared with the box). */
  contacts?: Record<string, Contact[]>;
  /** Activities the box reported (puzzles, quizzes, memory-lane chats). */
  activities?: { resident_id: string; received_at: string; activity: Record<string, unknown> }[];
}

interface Contact {
  id: string;
  name: string;
  relationship?: string;
  nickname?: string;
  birthday?: string;
  deceased?: boolean;
  died_on?: string;
  guidance?: string;
  notes?: string;
  related_to?: string;
  related_as?: string;
  dates?: { label: string; date: string }[];
}

interface Resident {
  id: string;
  name: string;
  preferred_name: string;
  room: string;
  date_of_birth: string;
  schedule: { time: string; what: string }[];
  care_summary: string;
  medications: { name: string; dose: string; when: string; purpose: string }[];
  observations: { at: string; type: string; value: string; by: string }[];
  allergies: string[];
  mobility: string;
  diet: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number, time = '09:00') => `${new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10)}T${time}:00Z`;

function seed(): Store {
  return {
    residents: {
      'res-001': {
        id: 'res-001',
        name: 'Margaret Thompson',
        preferred_name: 'Peggy',
        room: '12',
        date_of_birth: '1938-03-14',
        schedule: [
          { time: '08:30', what: 'Breakfast in the dining room' },
          { time: '11:00', what: 'Gentle exercise class in the lounge' },
          { time: '14:00', what: 'Bingo in the lounge' },
          { time: '16:00', what: 'Afternoon tea' },
        ],
        care_summary:
          'Mild to moderate dementia (Alzheimer\'s type). Type 2 diabetes, diet-controlled with metformin. Osteoarthritis in both knees. ' +
          'Walks with a frame; needs one carer for transfers. Hard of hearing on the left side. Can become anxious in the late afternoon; ' +
          'reassurance and talking about her late husband George or her garden helps.',
        medications: [
          { name: 'Metformin', dose: '500 mg', when: 'with breakfast and evening meal', purpose: 'diabetes' },
          { name: 'Donepezil', dose: '10 mg', when: 'at night', purpose: 'dementia' },
          { name: 'Paracetamol', dose: '1 g', when: 'up to four times a day as needed', purpose: 'knee pain' },
        ],
        observations: [
          { at: daysAgo(0, '07:30'), type: 'blood glucose', value: '6.8 mmol/L', by: 'Nurse Jane' },
          { at: daysAgo(1, '19:00'), type: 'mood', value: 'settled, enjoyed a visit from her son Tom', by: 'Carer Ade' },
          { at: daysAgo(2, '14:00'), type: 'weight', value: '61.2 kg (stable)', by: 'Nurse Jane' },
        ],
        allergies: ['penicillin'],
        mobility: 'Walking frame; one carer for transfers; falls risk: medium.',
        diet: 'Diabetic diet, soft food preferred, likes tea with milk and no sugar.',
      },
    },
    messages: [
      { id: randomUUID(), resident_id: 'res-001', from: 'Tom', relationship: 'son', received_at: daysAgo(3, '18:20'), text: 'Hi Mum, lovely to see you on Sunday. The tomatoes from your old allotment are finally ripening!', delivered_at: daysAgo(3, '19:00') },
    ],
    backups: {},
    notes: [],
    contacts: {
      'res-001': [
        { id: 'c-1', name: 'Sarah Thompson', relationship: 'daughter', birthday: '1966-' + new Date(Date.now() + 2 * 86400_000).toISOString().slice(5, 10), notes: 'Lives in Leeds with her husband Mark; visits on Wednesdays.' },
        { id: 'c-2', name: 'Tom Thompson', relationship: 'son', nickname: 'Tommy', birthday: '1969-07-22', notes: 'Lives nearby; looks after the old allotment.' },
        { id: 'c-3', name: 'Jack Thompson', relationship: 'grandson', related_to: 'Tom Thompson', related_as: 'son', birthday: '2003-11-30', notes: "Tom's son; at university in Durham studying history." },
        {
          id: 'c-4',
          name: 'George Thompson',
          relationship: 'husband',
          deceased: true,
          died_on: '2019',
          dates: [{ label: 'wedding anniversary', date: '1960-' + new Date(Date.now() + 86400_000).toISOString().slice(5, 10) }],
          guidance: 'Peggy sometimes asks for George, especially in the late afternoon. Do not tell her he has died. Ask her about him: their dancing days at the Locarno, his roses. Then gently move on.',
        },
      ],
    },
    activities: [],
  };
}

function load(): Store {
  try {
    return JSON.parse(readFileSync(FILE, 'utf8')) as Store;
  } catch {
    const s = seed();
    save(s);
    return s;
  }
}

function save(s: Store): void {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(s, null, 2));
}

let store = load();
const json = (v: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(v) }] });
const fail = (text: string) => ({ content: [{ type: 'text' as const, text }], isError: true });
const resident = (id: string) => store.residents[id];

/** One MCP server per request (stateless): the same tools the real app will offer. */
function mcpServer(): McpServer {
  const server = new McpServer({ name: 'empathika-app-practice', version: '0.1.0' });
  const rid = { resident_id: z.string().describe('The resident (filled in by Empathika)') };

  // ---------- Resident actions: anyone in the room ----------
  server.registerTool('resident_profile', { description: "The resident's name, the name they like, and their room. No health details.", inputSchema: rid }, async ({ resident_id }) => {
    const r = resident(resident_id);
    return r ? json({ name: r.name, preferred_name: r.preferred_name, room: r.room }) : fail('Unknown resident');
  });
  server.registerTool('resident_schedule', { description: "Today's activities and plans for the resident (meals, activities, visits).", inputSchema: rid }, async ({ resident_id }) => {
    const r = resident(resident_id);
    return r ? json({ date: today(), schedule: r.schedule }) : fail('Unknown resident');
  });

  // ---------- The care record: staff sessions only (Empathika enforces it) ----------
  server.registerTool('resident_care_summary', { description: 'Diagnoses, mobility, diet, allergies and how best to support the resident.', inputSchema: rid }, async ({ resident_id }) => {
    const r = resident(resident_id);
    return r ? json({ summary: r.care_summary, allergies: r.allergies, mobility: r.mobility, diet: r.diet }) : fail('Unknown resident');
  });
  server.registerTool('resident_medications', { description: 'Current medications with dose, timing and purpose.', inputSchema: rid }, async ({ resident_id }) => {
    const r = resident(resident_id);
    return r ? json({ medications: r.medications }) : fail('Unknown resident');
  });
  server.registerTool(
    'resident_observations',
    { description: 'Recent observations (vital signs, blood glucose, weight, mood, falls), newest first.', inputSchema: { ...rid, type: z.string().optional().describe('Only this kind, e.g. "blood glucose"') } },
    async ({ resident_id, type }) => {
      const r = resident(resident_id);
      if (!r) return fail('Unknown resident');
      const list = r.observations.filter((o) => !type || o.type.includes(type.toLowerCase())).sort((a, b) => b.at.localeCompare(a.at));
      return json({ observations: list.slice(0, 20) });
    },
  );
  server.registerTool(
    'resident_add_note',
    { description: 'Add a note to the resident\'s care record (e.g. what the resident said about pain or mood).', inputSchema: { ...rid, text: z.string(), by: z.string().optional() } },
    async ({ resident_id, text, by }) => {
      if (!resident(resident_id)) return fail('Unknown resident');
      store.notes.push({ resident_id, at: new Date().toISOString(), by: by ?? 'Empathika', text });
      save(store);
      return json({ ok: true });
    },
  );

  // ---------- System actions: Empathika's own jobs, never offered to the AI ----------
  server.registerTool(
    'family_updates_list',
    { description: 'Messages from the resident\'s family received since a time (oldest first).', inputSchema: { ...rid, since: z.string().optional() } },
    async ({ resident_id, since }) => {
      const updates = store.messages
        .filter((m) => m.resident_id === resident_id && (!since || m.received_at > since))
        .sort((a, b) => a.received_at.localeCompare(b.received_at))
        .map(({ resident_id: _r, delivered_at: _d, ...m }) => m);
      return json({ updates });
    },
  );
  server.registerTool(
    'family_update_delivered',
    { description: 'Empathika passed these messages on to the resident.', inputSchema: { ...rid, update_ids: z.array(z.string()), shared_at: z.string() } },
    async ({ update_ids, shared_at }) => {
      for (const m of store.messages) if (update_ids.includes(m.id)) m.delivered_at = shared_at;
      save(store);
      return json({ ok: true });
    },
  );
  server.registerTool(
    'memory_backup_put',
    { description: "Store the backup of Empathika's memory for this resident.", inputSchema: { ...rid, backup: z.record(z.string(), z.unknown()) } },
    async ({ resident_id, backup }) => {
      store.backups[resident_id] = { saved_at: new Date().toISOString(), backup };
      save(store);
      return json({ ok: true });
    },
  );
  server.registerTool('family_contacts', { description: "The resident's family and friends as staff recorded them: relationship, nickname, birthday, whether they have died, and guidance.", inputSchema: rid }, async ({ resident_id }) => {
    return json({ contacts: store.contacts?.[resident_id] ?? [] });
  });
  server.registerTool(
    'activity_log_add',
    { description: 'Empathika reports an activity the resident did (a puzzle, quiz or memory-lane chat) with the score.', inputSchema: { ...rid, activity: z.record(z.string(), z.unknown()) } },
    async ({ resident_id, activity }) => {
      store.activities = [...(store.activities ?? []), { resident_id, received_at: new Date().toISOString(), activity }];
      save(store);
      return json({ ok: true });
    },
  );
  server.registerTool('memory_backup_get', { description: "The latest backup of Empathika's memory for this resident.", inputSchema: rid }, async ({ resident_id }) => {
    return json({ backup: store.backups[resident_id]?.backup ?? null });
  });
  return server;
}

async function readBody(req: IncomingMessage): Promise<string> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 5_000_000) throw new Error('too large');
  }
  return body;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function page(): string {
  const msgs = [...store.messages].sort((a, b) => b.received_at.localeCompare(a.received_at));
  const backups = Object.entries(store.backups).map(([id, b]) => `<li>${esc(id)}: saved ${esc(b.saved_at)}</li>`).join('') || '<li>None yet</li>';
  const contacts = (store.contacts?.['res-001'] ?? []).map((c) => `<li><b>${esc(c.name)}</b> (${esc(c.relationship)})${c.nickname ? `, called "${esc(c.nickname)}"` : ''}${c.birthday ? ` · birthday ${esc(c.birthday)}` : ''}${c.deceased ? ` · died ${esc(c.died_on)}` : ''}${c.guidance ? `<div class="meta">Guidance: ${esc(c.guidance)}</div>` : ''}</li>`).join('') || '<li>None</li>';
  const activities = (store.activities ?? []).slice(-10).reverse().map((a) => `<li>${esc(a.received_at)} · ${esc(a.activity.label)}: ${esc(a.activity.correct)}/${esc(a.activity.asked)} (${esc(a.activity.ended)}, ${esc(a.activity.minutes)} min)</li>`).join('') || '<li>None yet</li>';
  const notes = store.notes.slice(-10).reverse().map((n) => `<li>${esc(n.at)} · ${esc(n.by)}: ${esc(n.text)}</li>`).join('') || '<li>None yet</li>';
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Empathika app (practice)</title>
<style>body{font:15px/1.5 system-ui;margin:0;background:#f6f7f9;color:#1b1f24}main{max-width:720px;margin:0 auto;padding:24px 16px}section{background:#fff;border:1px solid #e3e6ea;border-radius:12px;padding:16px;margin:0 0 16px}
input,textarea{font:inherit;padding:8px;border:1px solid #ccd;border-radius:8px;width:100%;box-sizing:border-box;margin:4px 0}button{font:inherit;font-weight:600;background:#2f6fed;color:#fff;border:0;border-radius:8px;padding:8px 14px}
li{margin:6px 0}.meta{color:#5d6670;font-size:13px}</style>
<main><h1>Empathika app · practice version</h1><p class="meta">For testing only. Resident <b>res-001</b>: Margaret "Peggy" Thompson, room 12.</p>
<section><h2>Send a message from family (as if by WhatsApp)</h2><form method="post" action="/family">
<input name="from" placeholder="From, e.g. Sarah" required><input name="relationship" placeholder="Relationship, e.g. daughter">
<textarea name="text" rows="3" placeholder="Message" required></textarea>
<label class="meta"><input type="checkbox" name="sensitive" value="yes" style="width:auto"> Sensitive news (staff should pass it on, not Empathika)</label><br><button>Send</button></form></section>
<section><h2>Messages</h2><ul>${msgs.map((m) => `<li><b>${esc(m.from)}</b>${m.relationship ? ` (${esc(m.relationship)})` : ''}: ${esc(m.text)}<div class="meta">${esc(m.received_at)} · ${m.sensitive ? 'sensitive · ' : ''}${m.delivered_at ? `passed on ${esc(m.delivered_at)}` : 'not passed on yet'}</div></li>`).join('')}</ul></section>
<section><h2>Memory backups</h2><ul>${backups}</ul></section>
<section><h2>Notes Empathika added to the care record</h2><ul>${notes}</ul></section>
<section><h2>Family and friends (shared with the box)</h2><ul>${contacts}</ul></section>
<section><h2>Activities Empathika reported</h2><ul>${activities}</ul></section></main>`;
}

const http = createServer((req: IncomingMessage, res: ServerResponse) => {
  void (async () => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      if (url.pathname === '/mcp') {
        if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) {
          res.writeHead(401, { 'Content-Type': 'text/plain' }).end('Unauthorised');
          return;
        }
        store = load();
        const server = mcpServer();
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        res.on('close', () => {
          void transport.close();
          void server.close();
        });
        await server.connect(transport);
        const body = req.method === 'POST' ? JSON.parse((await readBody(req)) || 'null') : undefined;
        await transport.handleRequest(req, res, body);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/family') {
        const f = new URLSearchParams(await readBody(req));
        store = load();
        store.messages.push({
          id: randomUUID(),
          resident_id: 'res-001',
          from: (f.get('from') ?? 'Family').trim(),
          relationship: f.get('relationship')?.trim() || undefined,
          received_at: new Date().toISOString(),
          text: (f.get('text') ?? '').trim(),
          sensitive: f.get('sensitive') === 'yes' || undefined,
        });
        save(store);
        res.writeHead(302, { Location: '/' }).end();
        return;
      }
      if (req.method === 'GET' && url.pathname === '/') {
        store = load();
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(page());
        return;
      }
      res.writeHead(404).end('Not found');
    } catch (err) {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' }).end((err as Error).message);
    }
  })();
});

http.listen(PORT, () => {
  console.log(`Empathika app (practice): http://localhost:${PORT}   MCP: http://localhost:${PORT}/mcp   token: ${TOKEN || '(none)'}`);
});
