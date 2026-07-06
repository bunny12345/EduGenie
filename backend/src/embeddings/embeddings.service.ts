import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import fetch from 'node-fetch';

@Injectable()
export class EmbeddingsService {
  dim = 8;

  // Map a possibly larger embedding into our internal dim by pooling
  private compressToDim(arr: number[]): number[] {
    if (!arr || arr.length === 0) return Array(this.dim).fill(0);
    if (arr.length === this.dim) return arr.map((v) => Number(v.toFixed(6)));
    const out: number[] = [];
    const chunk = Math.max(1, Math.floor(arr.length / this.dim));
    for (let i = 0; i < this.dim; i++) {
      const start = i * chunk;
      const slice = arr.slice(start, start + chunk);
      const avg = slice.reduce((s, x) => s + x, 0) / (slice.length || 1);
      out.push(Number(avg.toFixed(6)));
    }
    return out;
  }

  async embed(text: string): Promise<number[]> {
    const trimmed = (text || '').trim();
    // Prefer external semantic provider if configured
    try {
      if (process.env.OPENAI_API_KEY) {
        const model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
        const res = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
          },
          body: JSON.stringify({ input: trimmed, model })
        });
        const data = await res.json();
        if (data && data.data && data.data[0] && Array.isArray(data.data[0].embedding)) {
          return this.compressToDim(data.data[0].embedding as number[]);
        }
      } else if (process.env.HF_API_KEY && process.env.SEMANTIC_EMBEDDINGS_PROVIDER === 'hf') {
        const model = process.env.HF_EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2';
        const res = await fetch(`https://api-inference.huggingface.co/embeddings/${model}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.HF_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ inputs: trimmed })
        });
        const data = await res.json();
        if (data && Array.isArray(data)) {
          return this.compressToDim(data as number[]);
        }
      }
    } catch (e) {
      // fall back to deterministic if provider fails
      console.warn('semantic embed provider failed, falling back to deterministic:', e?.message || e);
    }

    // Stable, deterministic pseudo-embedding for prototypes using SHA-256
    const hash = crypto.createHash('sha256').update(trimmed || '').digest();
    const vec: number[] = [];
    for (let i = 0; i < this.dim; i++) {
      const b1 = hash[i * 2] ?? 0;
      const b2 = hash[i * 2 + 1] ?? 0;
      const uint = (b1 << 8) | b2; // 0..65535
      const v = (uint / 65535) * 2 - 1; // map to -1..1
      vec.push(Number(v.toFixed(6)));
    }
    return vec;
  }

  cosine(a: number[], b: number[]) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }
}
