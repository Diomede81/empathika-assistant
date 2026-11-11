# Activities: keeping the mind active

Empathika offers gentle activities to keep the resident's mind active: when the moment is right
in conversation, when they ask for something to do, or through an invitation on her screen.

| Activity | What happens | Checked by |
|---|---|---|
| ❓ **Trivia** | Multiple-choice questions from Empathika's own bank (about 115 questions): music, films and television, the Royal Family, places, food, nature, history, sport, general knowledge. "Let's do trivia about music" picks the topic | The box |
| 🔤 **Word puzzle** | Unscramble a word, with a clue ("N E D R A G: where flowers grow") | The box |
| 💬 **Finish the saying** | "A stitch in time…" | The box |
| 🔢 **Number puzzle** | Sums, times tables, counting change ("you pay with a £2 coin…") | The box |
| 🧠 **Memory game** | Three to five words to remember, a minute's chat, then say them back | The box |
| 🎯 **Quiz on a topic** | A quiz the AI makes up on any other topic they name (their home town, gardening…) | The AI |
| 📝 **Name five** | Name things in a category: flowers, things at the seaside… | The AI |
| 📷 **Memory lane** | An unhurried chat about their life, started from what Empathika knows: places, work, their people | The AI (what they tell is filed in their memory) |
| 👪 **Family stories** | A chat about one person in their family: Empathika starts from what she knows, gently asks about what she doesn't (where they live, shared memories…), and saves each story at once under that person | The AI (see [PEOPLE.md](PEOPLE.md)) |

**The box checks the answers to its own puzzles**, not the AI, so the scores mean something. It
understands spoken answers ("twenty five", "a pound and twenty pence", "c a t" spelt out) and gives a
second go with a clue before saying the answer. In trivia the resident can answer with the words ("the
Beatles"), the letter ("B") or the place ("the second one"); an unclear answer is asked again, never
guessed, and recent questions don't come round again for a while. The puzzle is shown big on the screen too, with a
**Clue** button.

**Three levels** per activity (easy, medium, harder). The level follows how the resident does: 80% or
more moves it up, 40% or less moves it down. Staff can set it on the control panel.

**Never a test.** Empathika praises effort, never says "wrong" bluntly, gives the answer kindly, and
stops the moment the resident wants. She doesn't offer activities when they seem tired or upset.

## The invitation on the screen

At the times set on the control panel (default 10:30 and 15:00), a card asks *"Fancy a word puzzle?"*
with **Yes please** and **Not now**. **Yes please** starts it straight away: Empathika says the first
question and listens, with no wake word needed. It offers the resident's favourites (the ones they
play to the end), and something they haven't done that day. No invitations in night mode or while
the microphone is off.

## For staff

The control panel's **Activities** tab shows the last 14 days: how often each activity was played,
the score, the level, and the recent sessions. Each session also goes to the care app
(`activity_log_add`, see [CARE-APP-MCP.md](CARE-APP-MCP.md#activities-system)), so it can sit next to
the care record. A single low score means little; a steady change over weeks is worth mentioning to
the team. The resident or staff can also ask "how have I been getting on with the puzzles?".

The log is encrypted on the box and is part of the backup to the care app.

To preview the screen cards on a computer: `/?demo=trivia`, `/?demo=puzzle`, `/?demo=puzzle-invite`, `/?demo=birthday`.
