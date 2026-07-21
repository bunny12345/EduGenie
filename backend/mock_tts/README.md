# Local Free TTS (Option 2)

This local service provides free server-generated voice audio for EduGenie without paid API calls.

## Engine

- Uses macOS built-in `say` command.
- If `ffmpeg` is installed, returns MP3 (`audio/mpeg`).
- If `ffmpeg` is missing, converts to WAV (`audio/wav`) using `afconvert`.
- AIFF is now only a last-resort fallback if both MP3 and WAV conversion fail.

## Run

```bash
cd backend
npm run mock-tts
```

Health check:

```bash
curl http://127.0.0.1:5005/health
```

Sample TTS request:

```bash
curl -X POST http://127.0.0.1:5005/tts \
  -H 'Content-Type: application/json' \
  -d '{"text":"Hello from EduGenie local TTS"}' \
  --output /tmp/edugenie-tts.aiff
```

## Backend env config

Set these in backend env if needed:

- `TTS_SERVICE_URL` default: `http://localhost:5005`
- `TTS_SERVICE_PATH` default: `/tts`
- `TTS_SERVICE_VOICE` optional preferred voice name
- `TTS_DEFAULT_VOICE` optional voice for mock-tts service itself

## Notes

- For better quality and more languages, you can later swap this service implementation with Piper/Coqui and keep the same `/tts` HTTP contract.
- Because this is local/self-hosted, there are no per-request API charges.
