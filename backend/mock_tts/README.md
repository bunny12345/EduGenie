# Local Free TTS (Option 2)

This local service provides free server-generated voice audio for EduGenie without paid API calls.

## Engine

- Uses `Piper` for local neural-style TTS.
- Returns MP3 (`audio/mpeg`) when `ffmpeg` is installed.
- Falls back to WAV (`audio/wav`) when `ffmpeg` is unavailable.

## Prerequisites

1. Install Piper (binary)
2. Download a Piper `.onnx` voice model file (and its companion `.json`)
3. Set `PIPER_MODEL` to the `.onnx` path

macOS quick setup used in this repo:

```bash
brew install pipx
/opt/homebrew/bin/pipx install piper-tts
mkdir -p backend/mock_tts/models
curl -L "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx" -o backend/mock_tts/models/en_US-lessac-medium.onnx
curl -L "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json" -o backend/mock_tts/models/en_US-lessac-medium.onnx.json
```

Example env setup:

```bash
export PIPER_BIN=piper
export PIPER_MODEL="$PWD/mock_tts/models/en_US-lessac-medium.onnx"
```

Note: this server auto-detects `~/.local/bin/piper` when present, so `PIPER_BIN` is usually optional.

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
  --output /tmp/edugenie-tts.mp3
```

## Backend env config

Set these in backend env if needed:

- `TTS_SERVICE_URL` default: `http://localhost:5005`
- `TTS_SERVICE_PATH` default: `/tts`
- `TTS_SERVICE_VOICE` optional model override sent by backend
- `PIPER_BIN` optional Piper binary path (default: `piper`)
- `PIPER_MODEL` Piper `.onnx` model path (required unless default path exists)
- `PIPER_MODEL_EN` model for English
- `PIPER_MODEL_TE` model for Telugu
- `PIPER_MODEL_HI` model for Hindi
- `PIPER_MODEL_TA` model for Tamil
- `PIPER_MODEL_KN` model for Kannada

Routing behavior:

- `/tts` looks at payload `language` (or `targetLanguage`) and picks a matching model.
- If a language-specific model file is missing, it falls back to `PIPER_MODEL`.
- If payload `voice` is provided, it is treated as an explicit model path override.

Example language model setup:

```bash
export PIPER_MODEL_EN="$PWD/mock_tts/models/en_US-lessac-medium.onnx"
export PIPER_MODEL_TE="$PWD/mock_tts/models/te_IN-voice.onnx"
export PIPER_MODEL_HI="$PWD/mock_tts/models/hi_IN-voice.onnx"
export PIPER_MODEL_TA="$PWD/mock_tts/models/ta_IN-voice.onnx"
export PIPER_MODEL_KN="$PWD/mock_tts/models/kn_IN-voice.onnx"
```

## Notes

- This service now uses Piper by default for better quality than macOS `say`.
- Backend translation already happens before local TTS for non-English targets, so routed models speak the translated text.
- Because this is local/self-hosted, there are no per-request API charges.
