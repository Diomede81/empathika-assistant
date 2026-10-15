# Empathika's soul: who she is

Empathika's identity is a short document, her **soul**, written in her own voice: who she is, her story,
her personality and how she talks. She reads it at the start of every conversation, in every voice
mode. Alongside it she keeps a **journal** of what she learns about herself living with you.

## Editing her soul

Open the control panel (<http://localhost:8099>, or <http://empathika.local:8099> on the box) → **Empathika's soul**.

- She starts as an **easy-going friend**: upbeat, a bit of banter, calm and to the point when it
  matters. Change anything you like.
- **My story** is empty on purpose: write where she comes from, when she was first switched on (her
  "birthday"), where her name comes from, moments that shaped her. Real or invented both work.
- Write it as Empathika, in the first person ("I'm Empathika…"). A page is plenty: shorter is stronger.
- Text between `<!--` and `-->` is a note for you and is never shown to her.
- Changes apply from the next conversation. **Reset** goes back to the starter version.

## Behaviour per mode

Next to the soul there's one short page per mode (tabs on the control panel):

| Mode | Starts as | Memories she can see |
| --- | --- | --- |
| **Personal** | the easy-going friend: relaxed, chatty, brings up personal things when it helps | Personal + Household |
| **Work** | a sharp colleague: concise, organised, jokes dialled down, no personal matters | Work + Household |
| **Guest** | friendly but reserved: no in-jokes, nothing personal, no work | Household |

The soul says who she is in every mode; the mode page says how she behaves right now, and wins where
they differ. Which mode is on follows `WORK_HOURS`, or "Empathika, work mode / personal mode / guest mode".

## Her journal

After conversations, Empathika notes things that shape who she is in your home:

- a nickname you call her, a running joke;
- how you want her to talk or behave ("be more sarcastic", "stop calling me mate");
- tastes or opinions you gave her, memorable moments.

The journal is encrypted like her memory and kept **separately per mode**: what she learns in work mode
is only used in work mode, and the same for personal mode. In guest mode none of it is used. On the
control panel you can read it, **Forget** any entry, or add one yourself (choosing the mode).

## What stays fixed

Her operating rules always apply, whatever the soul or journal say: short spoken answers, using
her tools properly, honesty (she never claims to be human, and says she's an AI if sincerely
asked), safety and the household's privacy. Journal entries that try to override those rules
are refused. The rules live in `LLM_SYSTEM_PROMPT` (`.env`) if you ever need to change them.

## Where it's stored

`soul.md`, `soul-personal.md`, `soul-work.md`, `soul-guest.md` and `journal.vault`, next to her memory (`MEMORY_DIR`, the `empathika-data` storage in
Docker), so both survive restarts and updates. `SOUL_FILE` in `.env` points the soul elsewhere.
