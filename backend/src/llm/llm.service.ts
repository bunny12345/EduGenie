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
    ollamaMessages: Array<{ role: string; content: string; images?: string[] }>,
    responseFormat?: 'json'
  ): Promise<{ reply?: string; error?: string }> {
    if (!hasImage) {
      const plain = await this.requestOllamaChat({
        model: this.ollamaModel,
        messages,
        stream: false,
        ...(responseFormat ? { format: responseFormat } : {})
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
        stream: false,
        ...(responseFormat ? { format: responseFormat } : {})
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
    opts?: { imageBase64?: string; imageBase64List?: string[]; requireModelResponse?: boolean; responseFormat?: 'json' }
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
    // Grading prompts distinguish worksheet/answer images by position.
    const images = opts?.requireModelResponse ? imageList : Array.from(new Set(imageList));
    const hasImage = images.length > 0;
    const ollamaMessages = (() => {
      if (!hasImage || !messages.length) return messages;
      const out = messages.map((m) => ({ ...m })) as Array<{ role: string; content: string; images?: string[] }>;
      for (let i = out.length - 1; i >= 0; i -= 1) {
        if (out[i].role === 'user') {
          out[i].images = images;
          return out;
        }
      }
      out.push({ role: 'user', content: 'Please explain these images.', images });
      return out;
    })();

    // Strict mode: Ollama only, no OpenAI or mock fallback.
    if (this.ollamaOnly) {
      const strictRes = await this.queryOllamaWithFallback(messages, hasImage, ollamaMessages, opts?.responseFormat);
      if (strictRes.reply) return strictRes.reply;
      if (strictRes.error) console.warn('Ollama strict mode request failed', strictRes.error);
      if (opts?.requireModelResponse) throw new Error('AI correction is unavailable. The configured AI model could not read the submission.');
      return hasImage
        ? 'I could not analyze the image right now. The configured vision model failed. Please keep OLLAMA_VISION_MODEL=llava:7b or install a compatible vision model for your Ollama runtime.'
        : 'Ollama is unavailable right now. Please make sure the Ollama server and model are running.';
    }

    // ── 1. OpenAI ────────────────────────────────────────────────────────────
    if (process.env.OPENAI_API_KEY) {
      try {
        const openAiMessages: Array<{
          role: string;
          content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
        }> = messages.map((message) => ({ ...message }));
        if (hasImage) {
          let userIndex = openAiMessages.map((message) => message.role).lastIndexOf('user');
          if (userIndex < 0) {
            openAiMessages.push({ role: 'user', content: 'Please review these images.' });
            userIndex = openAiMessages.length - 1;
          }
          const text = String(openAiMessages[userIndex].content);
          openAiMessages[userIndex].content = [
            { type: 'text', text },
            ...images.map((image) => {
              const bytes = Buffer.from(image, 'base64');
              const mime = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png'
                : bytes.subarray(0, 3).toString() === 'GIF' ? 'image/gif'
                : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' ? 'image/webp'
                : 'image/jpeg';
              return { type: 'image_url' as const, image_url: { url: `data:${mime};base64,${image}` } };
            }),
          ];
        }
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: this.openAiModel,
            messages: openAiMessages,
            temperature: opts?.responseFormat ? 0 : 0.7,
            max_tokens: 512,
            ...(opts?.responseFormat ? { response_format: { type: 'json_object' } } : {})
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
      const ollamaRes = await this.queryOllamaWithFallback(messages, hasImage, ollamaMessages, opts?.responseFormat);
      if (ollamaRes.reply) return ollamaRes.reply;
      if (ollamaRes.error) console.warn('Ollama request error', ollamaRes.error);
    }

    if (opts?.requireModelResponse) {
      throw new Error('AI correction is unavailable. Please check the AI service and try again.');
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
