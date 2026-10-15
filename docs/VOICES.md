# Choosing Empathika's voice

| Option | Sound | Cost | Privacy | Setup |
|---|---|---|---|---|
| **Piper** (default) | Clear but robotic | Free | Fully local | Nothing |
| **Kokoro** (recommended) | Natural, expressive | Free | Fully local | 2 minutes |
| **OpenAI voices** | Most natural; follows tone instructions ("witty British butler") | Roughly 1–2 cents per minute of speech | Reply text goes to OpenAI | 2 minutes + API key |

Prices and voice lists change, so check the provider's current pages.

## Kokoro (local, free, natural)

1. In `.env`, set:
   ```
   TTS_PROVIDER=openai
   TTS_BASE_URL=http://kokoro:8880/v1
   TTS_MODEL=kokoro
   TTS_VOICE=bf_emma
   ```
   (Use `http://127.0.0.1:8880/v1` if you run Empathika with `npm run dev` instead of Docker.)
2. Start Kokoro alongside everything else:
   ```bash
   docker compose --profile empathika --profile kokoro up -d
   ```
   The first start downloads the voice model (a few hundred MB). Wait until
   `docker compose logs kokoro` shows the server is ready.
3. Restart Empathika: `docker compose --profile empathika restart empathika`

**Voices to try** (`TTS_VOICE`):

| Voice | Style |
|---|---|
| `bf_emma` | British female, warm (the default) |
| `bf_isabella` | British female, brighter |
| `bm_george` | British male, warm |
| `bm_lewis` | British male, deeper |
| `bm_daniel` | British male, lighter |
| `bm_fable` | British male, storyteller |
| `am_michael`, `am_adam` | American male |

Kokoro can also blend voices, e.g. `TTS_VOICE=bf_emma+bf_isabella`. To hear them all, open
http://localhost:8880/web while Kokoro is running.

Kokoro runs on the computer's processor. It's quick on a modern Mac or a recent Intel/AMD
machine. On a very old or low-power machine, replies may start a little later than with Piper.

## OpenAI voices (cloud, most expressive)

1. In `.env`, set:
   ```
   TTS_PROVIDER=openai
   TTS_BASE_URL=https://api.openai.com/v1
   TTS_API_KEY=sk-...your OpenAI key...
   TTS_MODEL=gpt-4o-mini-tts
   TTS_VOICE=coral
   TTS_INSTRUCTIONS=Speak like a calm, kind British carer. Warm, unhurried and clear.
   ```
2. Restart Empathika: `docker compose --profile empathika up -d`

Voices to try: `coral` (warm female, the default), `nova`, `sage`, `shimmer`, `onyx` (deep male), `ash`, `echo`.
`TTS_INSTRUCTIONS` changes the delivery (accent, mood, pace) without changing the words. Keep
it to one or two sentences.

## Back to Piper

Set `TTS_PROVIDER=piper` and restart Empathika. To try a different Piper voice, change `--voice`
in `docker-compose.yml` (samples: https://rhasspy.github.io/piper-samples/).

## If you hear nothing

`docker compose logs --tail 30 empathika` names the problem, e.g.
`Voice (text-to-speech) failed: speech API answered 401…` (wrong key) or
`no audio from the speech API within 15s` (Kokoro still starting, or wrong `TTS_BASE_URL`).
