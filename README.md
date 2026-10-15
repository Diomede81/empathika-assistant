# Empathika

**Empathika** is a voice companion that lives in a care-home resident's room. She talks with the
resident, gets to know them (their life story, family, likes and routines), passes on news and
photos from their family, and helps the care team: a nurse can sign in with a PIN and ask about the
resident's care record. She runs on a small box with a round animated face, written in
**TypeScript / NestJS**, and connects to the **Empathika care app** over **MCP**.

```
Mic → Wake word → End-of-speech → Speech-to-text → AI model ⇄ memory, Empathika app (MCP) → Text-to-speech → Speaker
       local         local           local*           cloud or local                                       local*
```
\* swappable for cloud services. See [docs/RESEARCH.md](docs/RESEARCH.md) for the options and trade-offs.

## What Empathika does

- **Company and conversation.** Warm, patient and simple: short sentences, one question at a time,
  never "you already asked me that". She reassures rather than corrects when someone is confused. Her
  personality is adapted to each resident on the control panel. See **[docs/SOUL.md](docs/SOUL.md)**.
- **Memory of the resident.** Two encrypted vaults: **Resident** (life story, family and friends,
  likes, routines, important dates) and **Care** (health and wellbeing observations, for staff only).
  What staff, family and the control panel enter is **checked** and is never overwritten by what a
  resident living with dementia says; contradictions become care notes for staff instead. See
  **[docs/MEMORY.md](docs/MEMORY.md)**.
- **News from the family.** Relatives send WhatsApp messages and photos to the care home; the
  Empathika app passes them to the box. Empathika shows "💌 Sarah sent you a message", reads it out,
  remembers it ("any news from Sarah?"), and adds the photos to the evening photo frame. Sensitive
  news is held back for staff to deliver.
- **Staff access.** Each member of staff has a 4-digit PIN (NFC badges later). The PIN, typed on her
  screen, opens a **staff session** for a few minutes: Empathika can then read the care notes and look
  things up in the care record ("what medication is she on?", "how has her blood sugar been?"). Every
  sign-in and lookup is in an audit log. Outside a staff session she never discusses health details.
- **Safety.** She never gives medical advice. If the resident is in pain, unwell, has fallen or is
  upset, she stays calm, asks them to press their call bell or call a carer, and files a care note.
- **Backup.** The resident's memories are backed up to the Empathika app; a new or repaired box
  restores them by itself.
- **The everyday things:** the date and time, reminders ("remind me Sarah is visiting at 4"),
  today's activities from the care app, the weather, an evening photo frame, captions on screen for
  residents who are hard of hearing.

## The Empathika care app

Empathika needs the care app for the care record, family news and the memory backup. The
specification for the app team is **[docs/CARE-APP-MCP.md](docs/CARE-APP-MCP.md)**. Until the real
app exists, a **practice app** with one made-up resident runs locally:

```bash
npm install
npm run mock-app      # http://localhost:8090: send "WhatsApp" messages from the family
```
and in `.env`: `EMPATHIKA_APP_MCP_URL=http://localhost:8090/mcp`, `EMPATHIKA_APP_TOKEN=practice`,
`RESIDENT_ID=res-001`.

## Try it without audio

```bash
cp .env.example .env    # set LLM_API_KEY (free Groq key: https://console.groq.com) and the care app settings above
npm install
npm run chat
```
Type to Empathika. `/staff 4826` signs in as staff with that PIN (add staff first on the control
panel at http://localhost:8099, Staff tab), `/end` ends the staff session.

No Ubuntu machine? Everything also runs in Docker: **[docs/DOCKER.md](docs/DOCKER.md)**.

## Quick start (Ubuntu)

```bash
# 1. System packages
sudo apt install -y alsa-utils docker.io docker-compose-v2 nodejs npm   # Node 20+

# 2. Local voice services: wake word, speech-to-text, text-to-speech
docker compose up -d

# 3. Configure
cp .env.example .env    # LLM_API_KEY, the care app (EMPATHIKA_APP_*, RESIDENT_ID), MEMORY_KEY, PANEL_PASSWORD

# 4. Wake word: train "hey empathika" once (about 1 hour, free) - see training/README.md
#    Until then, the built-in "Hey Jarvis" works (WAKEWORD_NAMES=hey_jarvis).
npm install
npm run mic-check       # live mic levels + wake word detections, for tuning

# 5. Run
npm run dev
```

Then open the control panel (http://localhost:8099): add the staff and their PINs, what you know
about the resident (from their life-story form), their photos, and adapt Empathika's personality.

### Optional: local AI model (fallback, or fully offline)

```bash
docker compose --profile local-llm up -d
docker compose exec ollama ollama pull qwen3:8b     # qwen3:4b on CPU-only machines
```
Then set `LLM_FALLBACK_BASE_URL=http://127.0.0.1:11434/v1` and `LLM_FALLBACK_MODEL=qwen3:8b`
(or point the *primary* at Ollama to run with no cloud at all).

## Data protection

Empathika handles health information (special category data under UK/EU GDPR). On the box,
memories, staff list and audit log are encrypted; the control panel needs `PANEL_PASSWORD`. Before
going live, the care home should agree:

- **Where the AI model runs**: conversations (and, in staff sessions, care-record answers) go to the
  AI service in `LLM_BASE_URL`. Choose a provider with a UK/EU data processing agreement and no
  training on your data, or run a local model.
- **Consent and transparency**: residents (or their representatives) and families should know what
  Empathika remembers and who can see it; the Resident tab on the control panel is the full record.
- **The care app's side**: how WhatsApp messages are received (WhatsApp Business Platform) and how
  backups are stored and protected.

## Voice and screen

The default voice (Piper, British female) is fast but robotic. For a natural voice, switch to
**Kokoro** (free, runs locally) or **OpenAI voices** (paid, most expressive). See
**[docs/VOICES.md](docs/VOICES.md)**. `VOICE_MODE=realtime` gives the most natural conversation
through OpenAI Realtime or Gemini Live: **[docs/REALTIME.md](docs/REALTIME.md)**.

## The Empathika box

A Raspberry Pi 5 with a round screen showing Empathika's animated face, a 4-microphone array with echo
cancellation, and a proper speaker, in a 3D-printed case. If it ever loses WiFi, it shows a QR code to
set it up from a phone. See **[docs/PI.md](docs/PI.md)** for the setup and `hardware/enclosure/` for the
case. In a care home with several boxes, give each its own name during setup (e.g. `EMPATHIKA_HOSTNAME=room12`).

## Project layout

| Module | Responsibility |
|---|---|
| `audio/` | Microphone capture (`arecord`), playback (`aplay`), end-of-speech detection |
| `wyoming/` | Client for the Wyoming voice protocol (wake word, speech-to-text, text-to-speech services) |
| `wake-word/` | openWakeWord with the custom "hey empathika" model ([training guide](training/README.md)) |
| `stt/`, `tts/` | Speech-to-text (Whisper) and text-to-speech (Piper, Kokoro, OpenAI), sentence by sentence |
| `llm/`, `realtime/` | Any OpenAI-compatible AI model with tools and fallback; speech-to-speech mode |
| `conversation/` | The flow: wake → listen → think/act → speak → follow-up |
| `memory/` | The Resident and Care vaults, the conversation filer, digests, resident/staff modes |
| `care-app/` | The Empathika app connection (care record gating), memory backup, family news |
| `staff/` | Staff PINs (NFC badges later), lockout and the audit log |
| `soul/` | Empathika's personality and journal |
| `face/`, `control-panel/` | The round screen (face, cards, PIN pad) and the care team's web panel |
| `tools/` | `npm run chat` (type instead of talk), `npm run mic-check`, `npm run mock-app` (practice care app) |

## Roadmap

- [ ] NFC badge reader on the box (staff badges already have a place on the control panel)
- [ ] Staff accounts managed centrally in the Empathika app (one PIN for every box)
- [ ] Call-bell / alert integration when a resident says they've fallen or feel unwell
- [ ] Replying to family by voice ("tell Sarah I loved the photo")
- [ ] Reminiscence sessions built from the life story and family photos
