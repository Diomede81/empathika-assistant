/** Control panel: the resident's people (family and friends) and their activities (brain games). */

export interface PanelPerson {
  id: string;
  name: string;
  relation?: string;
  circle: string;
  circleLabel: string;
  nickname?: string;
  birthday?: string;
  birthdayIn?: number;
  deceased?: boolean;
  diedOn?: string;
  guidance?: string;
  about: { key: string; label: string; hint: string; text: string }[];
  updates: { at: string; text: string }[];
  contacts: { at: string; kindLabel: string; note?: string; auto?: boolean }[];
  source: string;
  lastContact?: string;
  visits30: number;
  /** What the memory holds about them (stories, facts). */
  facts: string[];
}

export interface PanelPeople {
  list: PanelPerson[];
  circles: Record<string, string>;
  contactKinds: Record<string, string>;
  canSync: boolean;
}

export interface PanelActivities {
  settings: { invite: boolean; inviteTime: string; inviteTime2: string };
  summary: { kind: string; label: string; times: number; asked: number; correct: number; minutes: number; level: number }[];
  sessions: { at: string; label: string; level: number; asked: number; correct: number; minutes: number; ended: string; topic?: string }[];
  playing?: string;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const hidden = (name: string, value: string) => `<input type="hidden" name="${name}" value="${esc(value)}">`;
const SOURCE: Record<string, string> = { app: 'from the care app', panel: 'added here', staff: 'told by staff', conversation: 'learnt in conversation' };

export const PEOPLE_CSS = `.person summary{display:flex;justify-content:space-between;gap:12px;padding:10px 0;list-style:none}.person summary::-webkit-details-marker{display:none}
.person{border-top:1px solid var(--line)}.person select{width:100%}.person:first-of-type{border-top:0}.person .body{padding:0 0 14px}.person label{display:block;font-size:13px;color:var(--muted);margin:8px 0 2px}
.person input[type=text],.person input:not([type]),.person input[type=date]{width:100%;font:inherit;padding:7px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--text)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}@media (max-width:520px){.grid2{grid-template-columns:1fr}}
.gone{background:var(--offbg);color:var(--muted)}.table{width:100%;border-collapse:collapse;font-size:14px}.table td,.table th{text-align:left;padding:6px 4px;border-top:1px solid var(--line)}.table th{color:var(--muted);font-weight:600;font-size:12px;text-transform:uppercase}`;

function personForm(p: PanelPerson | undefined, d: PanelPeople): string {
  const v = (x?: string) => esc(x ?? '');
  const opts = Object.entries(d.circles).map(([k, label]) => `<option value="${k}" ${p?.circle === k ? 'selected' : ''}>${esc(label)}</option>`).join('');
  return `<form method="post" action="${p ? '/people/save' : '/people/add'}">${p ? hidden('id', p.id) : ''}
<div class="grid2"><div><label>Name</label><input name="name" maxlength="60" required value="${v(p?.name)}" placeholder="e.g. Sarah Thompson"></div>
<div><label>Relationship to the resident</label><input name="relation" maxlength="60" value="${v(p?.relation)}" placeholder="daughter, grandson, old friend…"></div>
<div><label>What the resident calls them</label><input name="nickname" maxlength="40" value="${v(p?.nickname)}" placeholder="e.g. Tommy, Mum"></div>
<div><label>Birthday (year optional)</label><input name="birthday" maxlength="10" value="${v(p?.birthday)}" placeholder="1966-11-08 or 11-08"></div>
<div><label>Circle</label><select name="circle">${opts}</select></div>
<div><label><input type="checkbox" name="deceased" value="yes" ${p?.deceased ? 'checked' : ''} style="width:auto"> Has died</label><input name="diedOn" maxlength="10" value="${v(p?.diedOn)}" placeholder="Year, e.g. 2019"></div></div>
<label>Guidance for Empathika on how to talk about them (staff)</label><textarea name="guidance" rows="2" maxlength="400" placeholder="e.g. If she asks for George, don't say he has died: ask about their dancing days, then gently move on.">${v(p?.guidance)}</textarea>
${p ? p.about.map((a) => `<label>${esc(a.label)}</label><textarea name="about_${a.key}" rows="2" maxlength="400" placeholder="${esc(a.hint)}">${v(a.text)}</textarea>`).join('') : ''}
<div class="acts" style="margin-top:10px"><button class="btn" type="submit">${p ? 'Save' : 'Add'}</button></div></form>`;
}

function personRow(p: PanelPerson, d: PanelPeople): string {
  const kinds = Object.entries(d.contactKinds).map(([k, label]) => `<option value="${k}">${esc(label)}</option>`).join('');
  const sub = [
    p.relation ?? p.circleLabel,
    p.nickname ? `"${p.nickname}"` : '',
    p.deceased ? `died ${p.diedOn ?? ''}`.trim() : '',
    p.birthdayIn !== undefined && p.birthdayIn <= 14 ? `birthday ${p.birthdayIn === 0 ? 'today' : `in ${p.birthdayIn} days`}` : '',
    !p.deceased && p.lastContact ? `last in touch ${p.lastContact}` : '',
    !p.deceased && p.visits30 ? `${p.visits30} visit${p.visits30 === 1 ? '' : 's'} this month` : '',
  ].filter(Boolean);
  const updates = p.updates.length
    ? `<ul>${p.updates.map((u) => `<li class="row"><div>${esc(u.text)}<div class="meta">${esc(day(u.at))}</div></div><form method="post" action="/people/news-remove">${hidden('id', p.id)}${hidden('at', u.at)}<button class="btn secondary">Remove</button></form></li>`).join('')}</ul>`
    : '<p class="meta">No news yet.</p>';
  const contacts = p.contacts.length
    ? `<ul>${p.contacts.slice(0, 15).map((c) => `<li class="row"><div>${esc(c.kindLabel)}${c.note ? ` · ${esc(c.note)}` : ''}<div class="meta">${esc(day(c.at))}${c.auto ? ' · noticed by Empathika' : ''}</div></div><form method="post" action="/people/contact-remove">${hidden('id', p.id)}${hidden('at', c.at)}<button class="btn secondary">Remove</button></form></li>`).join('')}</ul>`
    : '<p class="meta">No visits or calls recorded yet.</p>';
  return `<details class="person" id="person-${esc(p.id)}"><summary><div><div class="name">${esc(p.name)}${p.deceased ? ' <span class="badge off">has died</span>' : ''}${p.guidance ? ' <span class="badge imp">guidance</span>' : ''}</div><div class="meta">${esc(sub.join(' · '))}</div></div><span class="meta">${esc(SOURCE[p.source] ?? p.source)} ▾</span></summary>
<div class="body">${personForm(p, d)}
${p.source === 'app' ? '<p class="meta">This person comes from the care app: the relationship, birthday, "has died" and guidance are updated from there every few hours, so change them in the app.</p>' : ''}
<h3>News</h3>${updates}
<form class="addfact" method="post" action="/people/news">${hidden('id', p.id)}<input name="text" maxlength="400" required placeholder="e.g. Passed his driving test"><button class="btn" type="submit">Add news</button></form>
<h3>Visits and calls</h3>${contacts}
<form class="addfact wrap" method="post" action="/people/contact">${hidden('id', p.id)}<select name="kind">${kinds}</select><input name="date" type="date"><input name="note" maxlength="200" placeholder="Note (optional)"><button class="btn" type="submit">Record</button></form>
<h3>What Empathika remembers about them</h3>${p.facts.length ? `<ul class="items">${p.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : '<p class="meta">Nothing yet: stories the resident tells about them are filed here after each conversation.</p>'}
<form method="post" action="/people/remove" onsubmit="return confirm('Remove ${esc(p.name)} from the list? What the memory holds about them stays.')" style="margin-top:12px">${hidden('id', p.id)}<button class="btn secondary" type="submit">Remove from the list</button></form>
</div></details>`;
}

export function peopleSection(d: PanelPeople): string {
  const rows = d.list.length ? d.list.map((p) => personRow(p, d)).join('') : '<p class="empty">Nobody yet. Add the resident\'s family and friends below, or share the list from the care app.</p>';
  return `<section id="people"><h2>Family and friends</h2>
<p class="meta">The people in the resident's life. Empathika talks about them by name, remembers their news and the stories the resident tells about them, and mentions birthdays. People are also added when family send messages through the care app, or when the resident mentions a relative with their relationship. What the resident says never changes the relationship, birthday or "has died" entered here or by the care app. For someone who has died, add guidance on how Empathika should respond if the resident asks for them.</p>
${d.canSync ? `<div class="acts" style="margin:0 0 12px"><form method="post" action="/people/sync"><button class="btn secondary" type="submit">Update from the care app</button></form></div>` : ''}
${rows}
<h3>Add someone</h3><div class="person"><div class="body">${personForm(undefined, d)}</div></div></section>`;
}

export function activitiesSection(a: PanelActivities): string {
  const rows = a.summary
    .map(
      (r) => `<tr><td>${esc(r.label)}</td><td>${r.times}</td><td>${r.kind === 'reminiscence' ? `${r.minutes} min` : r.asked ? `${r.correct}/${r.asked} (${Math.round((r.correct / r.asked) * 100)}%)` : '–'}</td>
<td><form method="post" action="/activities/level" style="display:flex;gap:6px">${hidden('kind', r.kind)}<select name="level" onchange="this.form.submit()">${[1, 2, 3].map((l) => `<option value="${l}" ${l === r.level ? 'selected' : ''}>${['Easy', 'Medium', 'Harder'][l - 1]}</option>`).join('')}</select></form></td></tr>`,
    )
    .join('');
  const sessions = a.sessions.length
    ? a.sessions
        .map((s) => `<li class="row"><div><b>${esc(s.label)}</b>${s.topic ? ` · ${esc(s.topic)}` : ''} · ${s.label === 'Memory lane' ? `${s.minutes} min` : `${s.correct} of ${s.asked}`}<div class="meta">${esc(new Date(s.at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))} · level ${s.level} · ${s.ended === 'finished' ? 'played to the end' : 'stopped early'}</div></div></li>`)
        .join('')
    : '<li class="empty">No activities yet.</li>';
  const s = a.settings;
  return `<section id="activities"><h2>Activities</h2>
<p class="meta">Word and number puzzles, finishing old sayings, a memory game, quizzes, naming things and memory-lane chats, to keep the resident's mind active. Empathika offers them when the moment is right and checks the puzzle answers herself; the level follows how the resident does (or set it here). Every activity is also sent to the care app when it accepts them. It is never a test: low scores on a given day mean little on their own, but a steady change over weeks is worth mentioning to the team.${a.playing ? ` <b>Playing now: ${esc(a.playing)}.</b>` : ''}</p>
<table class="table"><tr><th>Last 14 days</th><th>Times</th><th>Score</th><th>Level</th></tr>${rows}</table>
<h3>Invitation on the screen</h3>
<form class="addfact wrap" method="post" action="/activities/settings"><label style="flex:none;align-self:center"><input type="checkbox" name="invite" value="yes" ${s.invite ? 'checked' : ''}> Offer an activity at</label><input type="time" name="inviteTime" value="${esc(s.inviteTime)}"><span class="meta" style="align-self:center">and</span><input type="time" name="inviteTime2" value="${esc(s.inviteTime2)}"><button class="btn" type="submit">Save</button></form>
<p class="meta">"Fancy a word puzzle?" with <b>Yes please</b> (Empathika starts straight away, no wake word needed) and <b>Not now</b>. Never during night mode or while the microphone is off. Leave the second time empty for one a day.</p>
<h3>Recent</h3><ul>${sessions}</ul></section>`;
}
