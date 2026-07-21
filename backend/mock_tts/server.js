const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { spawn } = require('child_process');

const PORT = Number(process.env.TTS_PORT || 5005);
const HOST = process.env.TTS_HOST || '127.0.0.1';
const DEFAULT_VOICE = String(process.env.TTS_DEFAULT_VOICE || 'Samantha').trim();

function json(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function runCmd(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += String(d || ''); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve({ ok: true, stderr });
      return reject(new Error(`${cmd} exited with code ${code}: ${stderr}`));
    });
  });
}

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function speedToWordsPerMinute(speed) {
  const multiplier = clamp(speed, 0.5, 1.8, 1);
  return Math.round(180 * multiplier);
}

async function synthesizeSpeechToBuffer(text, voice, speed) {
  const tmpDir = path.join(os.tmpdir(), 'edugenie-tts');
  fs.mkdirSync(tmpDir, { recursive: true });

  const id = randomUUID();
  const aiffPath = path.join(tmpDir, `${id}.aiff`);
  const mp3Path = path.join(tmpDir, `${id}.mp3`);
  const wavPath = path.join(tmpDir, `${id}.wav`);

  const safeVoice = String(voice || DEFAULT_VOICE || '').trim();
  const rate = speedToWordsPerMinute(speed);
  const sayArgs = ['-o', aiffPath, text];
  if (safeVoice) {
    sayArgs.splice(2, 0, '-v', safeVoice);
  }
  sayArgs.splice(2, 0, '-r', String(rate));

  try {
    await runCmd('say', sayArgs);

    try {
      await runCmd('ffmpeg', ['-y', '-i', aiffPath, '-codec:a', 'libmp3lame', '-q:a', '4', mp3Path]);
      const mp3 = fs.readFileSync(mp3Path);
      return { buffer: mp3, mimeType: 'audio/mpeg' };
    } catch {
      // Browser-safe fallback: convert AIFF to WAV using macOS afconvert.
      try {
        await runCmd('afconvert', ['-f', 'WAVE', '-d', 'LEI16@22050', aiffPath, wavPath]);
        const wav = fs.readFileSync(wavPath);
        return { buffer: wav, mimeType: 'audio/wav' };
      } catch {
        const aiff = fs.readFileSync(aiffPath);
        return { buffer: aiff, mimeType: 'audio/aiff' };
      }
    }
  } finally {
    try { if (fs.existsSync(aiffPath)) fs.unlinkSync(aiffPath); } catch {}
    try { if (fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path); } catch {}
    try { if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath); } catch {}
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    return json(res, 200, { ok: true, service: 'mock-tts', engine: 'macos-say' });
  }

  if (req.method === 'POST' && req.url === '/tts') {
    try {
      const raw = await collectBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      const text = String(payload?.text || '').trim();
      const voice = String(payload?.voice || '').trim();
      const speed = payload?.speed ?? payload?.rate ?? 1;

      if (!text) {
        return json(res, 400, { ok: false, error: 'text is required' });
      }

      const clippedText = text.slice(0, 2200);
      const out = await synthesizeSpeechToBuffer(clippedText, voice, speed);
      res.writeHead(200, {
        'Content-Type': out.mimeType,
        'Content-Length': out.buffer.length,
        'Cache-Control': 'no-store',
      });
      res.end(out.buffer);
      return;
    } catch (e) {
      return json(res, 500, { ok: false, error: String(e?.message || e || 'tts failed') });
    }
  }

  return json(res, 404, { ok: false, error: 'not found' });
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`[mock-tts] listening on http://${HOST}:${PORT}`);
});
