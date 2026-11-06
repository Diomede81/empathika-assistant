# Family and friends

Empathika keeps a record for each person in the resident's life: family, friends, and the carers
they're fond of. She can then talk about Sarah or "our Tommy" the way a friend of the family would:
by name, knowing what they're up to, asking after them, and inviting the resident to tell her more.

## What each record holds

| | |
|---|---|
| **Name and relationship** | "Sarah Thompson, daughter". The relationship also puts them in a circle: family, friend, carer or other |
| **What the resident calls them** | "Tommy", "Mum": Empathika uses it too, and recognises it |
| **Birthday** | With or without the year. Empathika mentions birthdays in the next two weeks, and a 🎂 card shows on the day |
| **Has died** | With the year. Set by staff or the care app, never from what the resident says |
| **Guidance (staff)** | How Empathika should talk about them, e.g. *"If she asks for George, don't say he has died: ask about their dancing days, then gently move on."* |
| **About them** | Their family, where they live, work, shared memories, other |
| **News** | What's going on in their life, newest first |
| **Visits and calls** | Visited, called, video call, message, card. Family messages through the app are counted automatically |

Everything Empathika's memory holds about a person is joined to their record: the stories the
resident has told about them, facts staff entered, and their recent messages. When she's about to talk
about someone at length, or someone asks "who is Jack?", she pulls up the whole picture.

## Where the records come from

1. **The care app's contact list** (`family_contacts`): staff keep next of kin and family there, so
   the box fetches it at start-up and every 6 hours. The app is the reference for relationship,
   birthday, "has died" and guidance.
2. **The control panel**: **Family & friends** tab. Add someone, edit any detail, record a visit or
   news, see what Empathika remembers about them, or **Update from the care app** now.
3. **Family messages**: a relative who writes through the app is added if they aren't on the list
   yet, and each message counts as contact.
4. **Conversations**: after each conversation the filing clerk files what the resident said about
   someone under that person ("Peggy and George danced every Saturday at the Locarno"). A relative
   mentioned with their relationship ("my sister Edith in Scarborough") gets a record of their own;
   a birthday mentioned fills in theirs.
5. **Staff and visitors, out loud**: "Empathika, note that Tom visited today and brought tomatoes."

## Living with dementia

- What the resident says **never changes checked details**: the relationship, birthday or "has died"
  entered by staff, the panel or the care app. If they say something different ("George is picking
  me up later"), it becomes a care note for staff instead of a fact.
- For someone who has died, Empathika **follows the staff guidance**. With none, she never breaks the
  news herself and never pretends they're alive: she responds to the feeling and talks warmly about
  them and the memories.
- She never corrects the resident harshly about family; if they mix people up, she goes gently.
- Only staff (in a staff session, or on the panel) can remove someone.

## Privacy

The records are encrypted on the box with the rest of the memory (`people` file in `MEMORY_DIR`),
and are part of the backup to the care app, so a replacement box gets them back by itself. Staff
guidance goes to the AI with the record (so she can follow it) but she doesn't read it out.
