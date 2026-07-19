import { Injectable } from '@nestjs/common';
import fetch from 'node-fetch';

@Injectable()
export class LlmService {
  llmUrl: string;
  ollamaModel: string;
  ollamaVisionModel: string;
  openAiModel: string;
  ollamaOnly: boolean;

  private isTruthy(value?: string) {
    const v = String(value || '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes' || v === 'on';
  }

  private withLatestTag(model: string) {
    const m = String(model || '').trim();
    if (!m) return m;
    return m.includes(':') ? m : `${m}:latest`;
  }

  private async requestOllamaChat(payload: any): Promise<{ ok: boolean; reply?: string; status?: number; errorText?: string }> {
    try {
      const res = await fetch(`${this.llmUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data: any = await res.json();
        const reply = data?.message?.content || data?.response;
        return { ok: !!reply, reply: reply ? String(reply).trim() : '' };
      }

      let errorText = '';
      try {
        const data: any = await res.json();
        errorText = String(data?.error || data?.message || '').trim();
      } catch {
        try {
          errorText = String(await res.text() || '').trim();
        } catch {
          errorText = '';
        }
      }
      return { ok: false, status: res.status, errorText };
    } catch (e: any) {
      return { ok: false, errorText: String(e?.message || e || 'request failed') };
    }
  }

  private async queryOllamaWithFallback(
    messages: Array<{ role: string; content: string }>,
    hasImage: boolean,
    ollamaMessages: Array<{ role: string; content: string; images?: string[] }>
  ): Promise<{ reply?: string; error?: string }> {
    if (!hasImage) {
      const plain = await this.requestOllamaChat({
        model: this.ollamaModel,
        messages,
        stream: false
      });
      if (plain.ok && plain.reply) return { reply: plain.reply };
      return { error: plain.errorText || `status ${plain.status || 'unknown'}` };
    }

    const configured = String(this.ollamaVisionModel || '').trim();
    const candidates = Array.from(new Set([
      configured,
      this.withLatestTag(configured),
      'llava:7b',
      'llava:latest'
    ].filter(Boolean)));

    const failures: string[] = [];
    for (const model of candidates) {
      const res = await this.requestOllamaChat({
        model,
        messages: ollamaMessages,
        stream: false
      });

      if (res.ok && res.reply) {
        return { reply: res.reply };
      }

      failures.push(`${model}: ${res.errorText || `status ${res.status || 'unknown'}`}`);
    }

    return { error: failures.join(' | ') };
  }

  constructor() {
    this.llmUrl = process.env.LLM_URL || 'http://localhost:11434';
    this.ollamaModel = process.env.OLLAMA_MODEL || 'llama3';
    this.ollamaVisionModel = process.env.OLLAMA_VISION_MODEL || this.ollamaModel;
    this.openAiModel = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';
    this.ollamaOnly = this.isTruthy(process.env.OLLAMA_ONLY)
      || String(process.env.LLM_PROVIDER || '').trim().toLowerCase() === 'ollama';
  }

  /**
   * query() accepts either a raw prompt string (legacy) or a structured
   * messages array (OpenAI chat format).  Chooses provider in priority:
   *   1. OpenAI (if OPENAI_API_KEY is set)
   *   2. Ollama  (if LLM_URL is overridden to a real Ollama instance)
   *   3. Local mock server (fallback)
   */
  async query(
    promptOrMessages: string | Array<{ role: string; content: string }>,
    opts?: { imageBase64?: string; imageBase64List?: string[] }
  ): Promise<string> {
    // Normalize to messages array for all providers
    const messages: Array<{ role: string; content: string }> =
      typeof promptOrMessages === 'string'
        ? [{ role: 'user', content: promptOrMessages }]
        : promptOrMessages;

    const imageList = [
      ...((Array.isArray(opts?.imageBase64List) ? opts?.imageBase64List : [])
        .map((s) => String(s || '').trim())
        .filter(Boolean)),
      String(opts?.imageBase64 || '').trim(),
    ].filter(Boolean);
    const uniqueImages = Array.from(new Set(imageList));
    const hasImage = uniqueImages.length > 0;
    const ollamaMessages = (() => {
      if (!hasImage || !messages.length) return messages;
      const out = messages.map((m) => ({ ...m })) as Array<{ role: string; content: string; images?: string[] }>;
      for (let i = out.length - 1; i >= 0; i -= 1) {
        if (out[i].role === 'user') {
          out[i].images = uniqueImages;
          return out;
        }
      }
      out.push({ role: 'user', content: 'Please explain these images.', images: uniqueImages });
      return out;
    })();

    // Strict mode: Ollama only, no OpenAI or mock fallback.
    if (this.ollamaOnly) {
      const strictRes = await this.queryOllamaWithFallback(messages, hasImage, ollamaMessages);
      if (strictRes.reply) return strictRes.reply;
      if (strictRes.error) console.warn('Ollama strict mode request failed', strictRes.error);
      return hasImage
        ? 'I could not analyze the image right now. The configured vision model failed. Please keep OLLAMA_VISION_MODEL=llava:7b or install a compatible vision model for your Ollama runtime.'
        : 'Ollama is unavailable right now. Please make sure the Ollama server and model are running.';
    }

    // ── 1. OpenAI ────────────────────────────────────────────────────────────
    if (process.env.OPENAI_API_KEY) {
      try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: this.openAiModel,
            messages,
            temperature: 0.7,
            max_tokens: 512
          })
        });
        if (res.ok) {
          const data: any = await res.json();
          const reply = data?.choices?.[0]?.message?.content;
          if (reply) return reply.trim();
        }
        console.warn('OpenAI chat request returned non-ok status', res.status);
      } catch (e) {
        console.warn('OpenAI chat request error', e?.message || e);
      }
    }

    // ── 2. Ollama ─────────────────────────────────────────────────────────────
    if (this.isTruthy(process.env.USE_OLLAMA) || String(process.env.LLM_PROVIDER || '').trim().toLowerCase() === 'ollama') {
      const ollamaRes = await this.queryOllamaWithFallback(messages, hasImage, ollamaMessages);
      if (ollamaRes.reply) return ollamaRes.reply;
      if (ollamaRes.error) console.warn('Ollama request error', ollamaRes.error);
    }

    // ── 3. Local mock server (fallback) ───────────────────────────────────────
    try {
      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
      const prompt = lastUserMsg?.content || messages.map((m) => m.content).join('\n');
      const res = await fetch(this.llmUrl + '/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      if (res.ok) {
        const data: any = await res.json();
        return data?.reply || data?.text || 'Sorry, I could not generate a reply right now.';
      }
    } catch (e) {
      console.warn('Mock LLM request error', e?.message || e);
    }

    return 'Sorry, I could not generate a reply right now.';
  }
}
