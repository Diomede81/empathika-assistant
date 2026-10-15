# Running Empathika with Docker (no Ubuntu machine needed)

Everything runs in containers: the wake word, speech-to-text and voice services, and Empathika
herself. Containers have no sound card of their own, so how you test depends on what you
want to check:

| Goal | What you need | Setup time |
|---|---|---|
| **1. Test memory, family news, staff access and the AI model** | Nothing extra: you type, Empathika replies in text | 5 min |
| **2. Full voice test** (microphone and speaker) | A small "sound bridge" from your computer into the container | 10–15 min |

## Before you start

1. Install **Docker Desktop** (Mac/Windows) or Docker Engine (Linux).
2. In the project folder: `cp .env.example .env`, then set:
   - `LLM_API_KEY` (free Groq key: https://console.groq.com).
   - The care app. Until the real one exists, start the practice app on your computer with
     `npm install && npm run mock-app` and set `EMPATHIKA_APP_MCP_URL=http://host.docker.internal:8090/mcp`,
     `EMPATHIKA_APP_TOKEN=practice`, `RESIDENT_ID=res-001`. Its page, <http://localhost:8090>, sends
     "WhatsApp" messages from the family.
   - `PANEL_PASSWORD`, and add a member of staff with a PIN on the control panel (Staff tab).
   - `WAKEWORD_NAMES=hey_jarvis` until your "Hey Empathika" model is trained.

## 1. Typing mode (no audio)

```bash
docker compose --profile empathika build
docker compose run --rm empathika node dist/tools/chat.js
```
Try *"I grew up in Whitby, by the sea"*, *"any news from my family?"*, then `/staff 4826` (the PIN
you set) and *"what medication is she on?"*, then `/end`. The log shows which actions Empathika
called, and each reply shows how fast the AI answered. This is the quickest way to compare AI
providers: change `LLM_BASE_URL`, `LLM_MODEL` and `LLM_API_KEY` in `.env` and run it again.

## 2. Full voice test

Empathika talks to a **PulseAudio** sound server. You run one on your computer, and the
container connects to it over the network.

### Mac

```bash
brew install pulseaudio
# Start a sound server that accepts connections from Docker:
pulseaudio --load="module-native-protocol-tcp auth-ip-acl=127.0.0.1;192.168.0.0/16;172.16.0.0/12 auth-anonymous=1" \
           --exit-idle-time=-1 --daemon
pactl info   # should print "Server Name: pulseaudio"
```
macOS will ask whether Terminal may use the microphone: allow it
(System Settings → Privacy & Security → Microphone). To stop the sound server later:
`pulseaudio --kill`.

The default in `docker-compose.yml` (`PULSE_SERVER=tcp:host.docker.internal:4713`) already
points at it.

### Windows (Docker Desktop with WSL 2)

Windows 11 ships a sound server inside WSL (WSLg), so no extra install is needed.
Run the commands from an **Ubuntu (WSL) terminal**, not PowerShell, and add this to `.env`:
```
PULSE_SERVER=unix:/mnt/wslg/PulseServer
```
and add this volume under the `empathika` service in `docker-compose.yml`:
```yaml
    volumes: ["/mnt/wslg:/mnt/wslg"]
```
Tip: on Windows you can also skip Docker for Empathika itself and run `npm run dev` directly in
the WSL Ubuntu terminal. WSL *is* Ubuntu, and its microphone and speakers work out of the box.

### Linux desktop

Add to `.env`: `PULSE_SERVER=unix:/run/user/1000/pulse/native` and mount it:
`volumes: ["/run/user/1000/pulse:/run/user/1000/pulse"]`. Replace 1000 with the output of `id -u`.

### Start everything

```bash
docker compose --profile empathika up -d --build
docker compose logs -f empathika
```
Say **"Hey Jarvis"** (or "Hey Empathika" once trained). The log shows each step and its timing.

**Microphone check inside the container:**
```bash
docker compose run --rm empathika node dist/tools/mic-check.js
```

## Optional: local AI model (Ollama) in Docker

```bash
docker compose --profile empathika --profile local-llm up -d
docker compose exec ollama ollama pull qwen3:4b
```
In `.env`, inside Docker the address is the service name:
`LLM_FALLBACK_BASE_URL=http://ollama:11434/v1` and `LLM_FALLBACK_MODEL=qwen3:4b`.
On a laptop without an NVIDIA GPU, expect local answers to take a few seconds. It's
fine for checking that the fallback works, but it's not the real experience.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Cannot connect to empathika-app` | Check `EMPATHIKA_APP_MCP_URL` (inside Docker, `localhost` is the container: use `host.docker.internal` or the app's address) and `EMPATHIKA_APP_TOKEN` |
| `Connection refused` / no sound (Mac) | Is the sound server running? `pactl info`. Restart it with the command above |
| Empathika never hears the wake word | Run the mic-check; on Mac, check the microphone permission for Terminal |
| Empathika wakes (chime) but never answers | Run `docker compose logs --tail 30 empathika`. Every outcome is logged: "No request heard" (lower `VAD_RMS_THRESHOLD` as suggested), "could not make out any words", or a speech-to-text or voice service error naming the service to check |
| Audio is choppy | Expected over a network bridge on some laptops. It disappears on the final Ubuntu machine |
