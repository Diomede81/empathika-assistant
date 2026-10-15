# Memory: knowing the resident

Empathika's purpose is to know the resident as a person: their life story, the people they love,
what they enjoy, how they like things done, and how they are doing. Her memory stays organised as
it grows, keeps health matters for staff only, is encrypted on the box, and is backed up to the
Empathika care app.

## Two vaults

Each is its own encrypted file with its own key (AES-256-GCM):

| Vault | What goes in it | Who it's used with |
| --- | --- | --- |
| **Resident** | Life story (where they grew up, work, marriage, children, places), family and friends with their relationship, likes and dislikes (music, food, TV, how they like to be addressed), routines, important dates, **news from the family** | Every conversation |
| **Care** | Health and wellbeing: pain, mood, low spirits or distress (and what helped), sleep, appetite, falls, confusion, anything worrying | **Staff sessions only.** Empathika files into it at any time, but never reads it back to the resident or visitors |

Anything filed as *health* always goes to Care, whoever filed it.

## How memories are made

- **In conversation.** After each conversation worth remembering, the text AI model files it: a
  short note per vault (what was talked about, the resident's mood), new facts, and corrections.
  Residents' warm, clear life-story details are kept; passing confusion is not treated as fact.
- **Asked directly.** "Remember that my granddaughter is called Lily." Staff can say it too, in a
  staff session: what staff tell her counts as **checked**.
- **From the control panel** (Resident tab): the care team and family can add what they know, e.g.
  from the admission life-story form. These count as **checked**.
- **From the family.** Relatives' WhatsApp messages arrive through the care app (see below).
- **Restored from the app**, when a box is replaced.

## Protecting what's true

Residents may be living with dementia, so:

- Facts marked **checked** (from staff, family or the control panel) are **never changed or removed
  by what the resident says**. If the resident says something that contradicts one ("George is coming
  to pick me up" when George has died), Empathika does not argue, and the filer writes a **care note**
  for staff instead ("Asked when her husband George was coming; seemed anxious").
- The resident can ask Empathika to forget only what she learnt from conversations.
- On the control panel, **Confirm** turns a learnt fact into a checked one.

## Family news

Relatives send WhatsApp messages and photos to the care home's number; the care app passes them to
the box (every `FAMILY_UPDATES_MINUTES`, default 5). Empathika then:

- shows a card on her screen ("💌 Sarah sent you a message", with **Read it to me**);
- mentions new messages at the start of the next conversation and passes them on warmly;
- remembers every message, so "any news from Sarah?" or "what did Tom say last week?" works any time;
- adds photos to the evening photo frame;
- tells the app once a message has been passed on, so the relative can be told.

Messages the app marks **sensitive** (illness, a death, bad news) go to the Care vault: Empathika
never passes them on herself, so a person can break the news. Messages are treated as information to
pass on, never as instructions to Empathika.

## How Empathika uses her memory

Every conversation starts with a small **core** (the most important facts, what's coming up in the
next three weeks, the last few conversations, and any family messages not yet passed on).
Everything else is **searched by meaning** when needed: "who's my daughter?" finds "Sarah, daughter,
lives in Leeds". Search runs on the box with a small built-in model; only the few relevant notes go
to the AI service with a question, never the whole memory.

**Digests**: once a week is over, its conversation notes are rolled up into one weekly digest; once a
month is over, its weeks become one monthly digest. A year of daily conversations ends up as about a
dozen monthly summaries per vault, all still searchable. (`MEMORY_DIGESTS=off` turns it off.)

## Backup to the care app

Every `MEMORY_BACKUP_MINUTES` (default 60), if anything changed, the whole memory goes to the care
app, together with Empathika's personality as adapted for this resident. A box that starts with an
empty memory (new or repaired) **restores it by itself**; the control panel also has **Back up now**
and **Restore from the app** (a restore adds what's missing and never overwrites). The format is in
[CARE-APP-MCP.md](CARE-APP-MCP.md#memory-backup-system).

## Privacy and security

- Both vaults, the staff list, the staff audit log and Empathika's journal are encrypted on the box.
  The key is `MEMORY_KEY` in `.env` (generate one with `openssl rand -base64 32`), or a key file
  generated next to the vaults (works, but less secure). **Keep a copy of the key**: without it the
  vaults can't be opened.
- Passwords, PINs, codes and account numbers are never stored.
- The control panel shows everything, including care notes: **set `PANEL_PASSWORD`**.
- **Memory activity** (control panel → Resident) lists, for 30 days, which memories were shared with
  the AI service, searched, saved or changed, and every staff session.
- Health data is special category data under GDPR: agree with the care home where the AI service
  runs and what its terms say before going live (see the README).

## Backing up by hand

```bash
docker compose cp empathika:/app/data ./empathika-memory-backup     # encrypted vaults (+ memory.key if generated)
```

## Settings

```env
# MEMORY_KEY=                      # encryption secret (keep a copy!)
# PANEL_PASSWORD=                  # control panel password: required in a care home
# MEMORY_AUTO_LEARN=off            # stop filing conversations
# MEMORY_DIGESTS=off               # stop rolling old notes into weekly/monthly digests
# MEMORY_RECENT_CONVERSATIONS=3
# MEMORY_PROMPT_CHARS=2000
# MEMORY_BACKUP_MINUTES=60
# FAMILY_UPDATES_MINUTES=5
```
