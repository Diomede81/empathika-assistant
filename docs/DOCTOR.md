# Doctor mode

When a doctor (or nurse practitioner, or another clinician) visits the resident, Empathika can brief
them, answer their questions, and take down their update, then make sure the care staff act on it.

## Setting it up

On the control panel, **Staff** tab: add the doctor with their own 4-digit PIN and tick **Doctor or
clinician**. That's all. Their PIN on Empathika's screen (hold a finger on it for 2 seconds → **Staff**)
opens a **doctor session** of 20 minutes (`DOCTOR_SESSION_MINUTES`); the screen shows **Doctor: Dr Patel**.

## What the doctor can do

**Get a briefing.** Empathika offers it at the start: since the last doctor's visit (or the last 30 days),

- whether the last visit's instructions were acknowledged by staff, and what they did;
- the care notes: what the resident has said about pain, mood, sleep, eating or falls, and what staff
  reported, with dates. What the resident said herself is marked as not verified;
- how the activities are going (the last 14 days against the 14 before: a steady change matters, one
  score doesn't);
- who from the family has visited or been in touch.

**Ask anything.** "What is she on?", "How have her blood sugars been?", "Any falls this month?". She
answers from the care record in the care app (medication, observations, care plan) and her own care
notes, with the date and who recorded each figure. She says plainly when something isn't recorded.
She never diagnoses, never suggests treatment or doses, and never guesses.

**Dictate their update**, one item at a time:

| Kind | Example | Open until staff acknowledge? |
|---|---|---|
| Finding | "Left knee: mild effusion, full range of movement" | No |
| Medication change | "Increase paracetamol to 1 g four times a day for two weeks" | **Yes** |
| Instruction for staff | "Cold pack to the left knee twice a day" | **Yes** |
| Follow-up | "Review in two weeks; refer to physiotherapy if no better" | **Yes** |
| Note | Anything else for the record | No |

Empathika **reads each item back** and waits for a yes: drug names and doses are easy to mishear. "No,
I said ten minutes" corrects it; "scrap that" withdraws it. Before the session ends she reads the whole
list back and asks if anything is missing.

> **A medication change dictated to Empathika is a note. It does not change the prescription or the
> medication chart.** She says so to the doctor each time. It must still be prescribed and charted the
> usual way; the open item is what reminds the staff to check that it was.

## Making sure it is addressed

Medication changes, instructions and follow-ups stay **open** until a member of staff acknowledges them:

1. When the doctor's session ends, the screen shows a discreet card: **"For the care staff: a note is
   waiting"**. It shows no content, because the resident and visitors can see the screen. It comes
   back each morning while anything is open.
2. The **next staff session starts with the open items**: Empathika reads them out before anything
   else. "Done", "seen", or "chart updated, prescription requested" acknowledges them, with the staff
   member's name, the time, and what they said they did.
3. The control panel's **Staff** tab lists every note under **Doctor's notes**, with **Acknowledge**
   buttons, and the Overview shows how many are waiting.
4. At the doctor's next visit, the briefing starts with what was acknowledged and what was not.

## Where the notes go

- **On the box**, encrypted, with the rest of the care information.
- **In the Care vault** of her memory, so staff can ask "what did the doctor say about her knee?" in a
  staff session. Never outside one: the resident and visitors cannot hear the doctor's notes.
- **To the care app** (`clinical_note_add`, see [CARE-APP-MCP.md](CARE-APP-MCP.md#doctors-notes-system)), with
  each acknowledgement, so they sit in the care record.
- **In the backup**, so a replacement box has them.
- Every note, correction and acknowledgement is in the **staff audit log** with the name.

## Good to know

- Health details are said out loud in a doctor session: it's for the doctor to decide who is in the room.
- The session ends by itself, when the doctor says so, or with **End** on the screen.
- A doctor session can do everything a staff session can; a staff session cannot dictate doctor's notes.
- Empathika's own care notes (what the resident told her) are observations, not clinical findings.
