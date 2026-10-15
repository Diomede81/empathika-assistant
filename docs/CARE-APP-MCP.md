# The Empathika care app: what Empathika needs from it

This is the specification for the team building the **Empathika app** (the care home's main
system). Each Empathika box in a resident's room connects to the app over **MCP** (Model
Context Protocol, Streamable HTTP). Through it, the box:

1. answers **staff questions about the resident** from the care record (medications,
   observations, care plan), but only during a staff session;
2. receives **news from the family** (relatives' WhatsApp messages and photos) and passes it on;
3. keeps a **backup of the resident's memories**, so nothing is lost if a box breaks or is replaced.

A practice version of the app ships with Empathika so the box can be tested before the real
app exists: `npm run mock-app` (code: `src/tools/mock-care-app.ts`). It implements everything
below with one made-up resident and a web page for sending "family messages".

## Connection

| Setting on the box (`.env`) | Meaning |
|---|---|
| `EMPATHIKA_APP_MCP_URL` | The app's MCP address, e.g. `https://app.example-carehome.com/mcp` |
| `EMPATHIKA_APP_TOKEN` | Sent as `Authorization: Bearer <token>` on every request. One token per box is best (it can be revoked) |
| `RESIDENT_ID` | The app's id for the resident in this room |

- Use **HTTPS** in production. The box sends health-related data (memories, care notes) to the app.
- Every action takes a `resident_id` argument. **The box always fills it in itself** from
  `RESIDENT_ID`, and the AI never sees it. The app should still check that the token is
  allowed to access that resident (one box, one resident).
- Answers are text. Where JSON is shown below, return it as a single JSON text block.
  Return errors as MCP tool errors (`isError: true`) with a short human-readable message.

## The three kinds of action

The box decides what the AI may use **by action name**:

| Kind | Who can use it | How the box recognises it |
|---|---|---|
| **Resident actions** | Anyone in the room (resident, visitors) | Names in `EMPATHIKA_APP_RESIDENT_TOOLS` (default `resident_profile,resident_schedule`) |
| **System actions** | Only the box itself (backup, family news); never offered to the AI | Names matching `EMPATHIKA_APP_SYSTEM_TOOLS` (default `memory_backup_*,family_update*,staff_*`) |
| **Care record** | Only during a **staff session** (a member of staff entered their PIN on the box) | Every other action |

So **any new action the app adds is staff-only by default**, which is the safe default. To offer
a new action to residents, add its name to `EMPATHIKA_APP_RESIDENT_TOOLS`.

Every care-record call is written to the box's staff audit log with the staff member's name.
Actions whose name contains `add`, `create`, `update`, `delete`, `write`, `edit`, `set`, `log`
or `record` as a word (e.g. `resident_add_note`) are only run after the member of staff
confirms out loud.

Write **clear descriptions** for every action: the AI reads them to decide what to call.

## Resident actions (anyone in the room)

These must contain **no health information**.

### `resident_profile`
The resident's name, the name they like to be called, and their room.
```json
{ "name": "Margaret Thompson", "preferred_name": "Peggy", "room": "12" }
```

### `resident_schedule`
Today's plans: meals, activities, visits, outings. Arguments: `resident_id`.
```json
{ "date": "2026-10-15", "schedule": [ { "time": "14:00", "what": "Bingo in the lounge" }, { "time": "16:00", "what": "Sarah is visiting" } ] }
```

## Care record (staff sessions only)

Suggested set; the exact names and fields are up to the app, as long as the descriptions are clear.

| Action | Returns |
|---|---|
| `resident_care_summary` | Diagnoses, mobility, diet, allergies, how best to support the resident |
| `resident_medications` | Current medications: name, dose, timing, purpose |
| `resident_observations` (optional `type`) | Recent observations, newest first: vital signs, blood glucose, weight, mood, falls, with who recorded them |
| `resident_care_plan` | Goals and agreed actions |
| `resident_add_note` (`text`, optional `by`) | Adds a note to the care record (the box asks for a spoken "yes" first) |

Include **dates and who recorded each entry**: Empathika is told to say where information comes
from and how recent it is.

## Family news (system)

Relatives send WhatsApp messages and photos to the care home's WhatsApp Business number; the
app receives them (WhatsApp Business Platform webhook), works out which resident they are for,
and keeps them for the box. **The box polls** (every `FAMILY_UPDATES_MINUTES`, default 5), so no
inbound connection to the box is needed.

### `family_updates_list`
Arguments: `resident_id`, optional `since` (ISO time: return only messages received after it).
```json
{
  "updates": [
    {
      "id": "msg-8812",
      "from": "Sarah",
      "relationship": "daughter",
      "received_at": "2026-10-15T09:12:00Z",
      "text": "Hi Mum! Lily won her swimming race on Saturday.",
      "photos": [ { "url": "https://app.example-carehome.com/media/abc.jpg", "caption": "Lily with her medal" } ],
      "sensitive": false
    }
  ]
}
```
- `id` must be unique and stable: the box uses it to avoid saving a message twice.
- `photos`: either `url` (fetched by the box with the same Bearer token when it is on the app's
  own address) or `data_base64`. JPEG, PNG or WebP, up to 15 MB. They go to the resident's
  evening photo frame.
- `sensitive: true` for difficult news (illness, a death, bad news). The box files it for staff
  only and **never passes it on itself**, so a person can break the news. The app should let
  staff mark messages as sensitive, and ideally flag likely ones automatically.

### `family_update_delivered`
Arguments: `resident_id`, `update_ids` (array of the message ids), `shared_at`
(ISO time). Called when Empathika passed messages on to the resident, so the app can tell the
relative ("Mum heard your message ✓").

## Memory backup (system)

The box sends the resident's whole memory to the app every `MEMORY_BACKUP_MINUTES` (default
60) when something changed, and fetches it when a box starts with an empty memory (a new or
repaired box), or when staff press "Restore from the app" on the box's control panel.

### `memory_backup_put`
Arguments: `resident_id`, `backup` (object). Store it, replacing the previous one (keeping a few
older versions is a good idea). The backup contains:
```json
{
  "format": "empathika-memory", "version": 1, "takenAt": "2026-10-15T17:36:00Z",
  "vaults": [
    { "name": "resident", "items": [ { "id": "…", "kind": "life_story", "subject": "Whitby", "text": "Peggy grew up in Whitby and worked as a seamstress", "source": "conversation", "createdAt": "…", "updatedAt": "…" } ], "episodes": [ { "id": "…", "at": "…", "summary": "Talked about her garden; cheerful." } ] },
    { "name": "care", "items": [ … ], "episodes": [ … ] }
  ],
  "soul": { "soul": "…", "resident": "…", "staff": "…" },
  "journal": [ { "text": "Peggy likes to be called Peggy, not Margaret", "at": "…" } ]
}
```
- `resident` vault: who the resident is (life story, family, likes, routines, family news).
- `care` vault: health and wellbeing observations: **special category health data under GDPR**.
  Store and protect it like the rest of the care record.
- `soul` / `journal`: Empathika's personality as adapted for this resident.

The app can also **show these memories to staff and family** ("What Empathika knows about Mum"):
the `resident` vault is the life-story book.

### `memory_backup_get`
Arguments: `resident_id`. Returns `{ "backup": <the object above> }`, or `{ "backup": null }`
when there is none. A restore only adds what is missing on the box; it never overwrites.

## Later: staff accounts from the app

Staff PINs are set on each box's control panel for now. When the app manages staff centrally,
it can offer `staff_verify_pin` / `staff_verify_badge` (system actions) so a PIN or NFC badge
works on every box; the box's `StaffService` is where this plugs in.
