import { Injectable } from '@nestjs/common';
import fetch from 'node-fetch';

@Injectable()
export class LlmService {
  llmUrl: string;

  constructor() {
    this.llmUrl = process.env.LLM_URL || 'http://localhost:11434';
  }

  async query(prompt: string) {
    // Minimal adapter: POST to LLM endpoint expected to accept JSON {prompt}
    try {
      const res = await fetch(this.llmUrl + '/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      if (!res.ok) {
        console.warn('LLM request failed', res.status);
        return 'Sorry, I could not generate a reply right now.';
      }
      const data = await res.json();
      return data.reply || data.text || JSON.stringify(data);
    } catch (e) {
      console.warn('LLM request error', e?.message || e);
      return 'Sorry, I could not generate a reply right now.';
    }
  }
}
