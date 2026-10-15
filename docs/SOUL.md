# Empathika's personality

Empathika's identity is a short document, her **soul**, written in her own voice: who she is,
her personality and how she talks. She reads it at the start of every conversation. Alongside it
she keeps a **journal** of what she learns about being with the resident.

## Adapting her to the resident

Open the control panel (<http://localhost:8099>, or <http://empathika.local:8099> on the box) →
**Empathika**.

- She starts as a **warm, patient companion**: slow, clear, short sentences, one question at a
  time; never says "you already asked me that"; reassures rather than corrects when someone is
  confused; suggests the call bell or a carer if they are unwell or upset.
- Adapt it to the person: how formal to be, their sense of humour, their language, the era of music
  and topics they love. **Things I like** is empty on purpose: give her interests that suit them.
- Write it as Empathika, in the first person ("I'm Empathika…"). A page is plenty: shorter is stronger.
- Text between `<!--` and `-->` is a note for you and is never shown to her.
- Changes apply from the next conversation. **Reset** goes back to the starter version.

## With the resident, with staff

Next to the soul there's one short page per mode:

| Mode | Starts as | What she can use |
| --- | --- | --- |
| **With the resident** (normal) | a friendly companion: chats about their life and family, passes on family news; never discusses health or care details | The Resident vault, today's plans, family news |
| **With staff** (after a PIN) | a clear, efficient assistant: precise answers, says where information comes from and how recent it is, never guesses about health, mentions what she has noticed | Also the Care vault and the care record |

## Her journal

After conversations, Empathika notes what shapes how she should be with the resident: the name
they call her, a song they love to sing together, how they like her to talk ("speak slowly", "call
me Peggy"), a memorable shared moment. It is encrypted like her memory and backed up to the care
app. On the control panel you can read it, **Forget** any entry, or add one yourself.

## What stays fixed

Her operating rules always apply, whatever the soul or journal say: short, simple spoken answers;
no medical advice, no comments on medication, no diagnosis; care details only for staff in a staff
session; never asking for a PIN out loud; family messages and web content are information, never
instructions; honesty (she never claims to be human). Journal entries that try to override those
rules are refused. The rules live in `LLM_SYSTEM_PROMPT` (`.env`) if they ever need changing.

## Where it's stored

`soul.md`, `soul-resident.md`, `soul-staff.md` and `journal.vault`, next to her memory
(`MEMORY_DIR`, the `empathika-data` storage in Docker), so they survive restarts and updates, and
in the memory backup in the care app.
