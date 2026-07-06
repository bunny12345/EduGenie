import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { LlmService } from '../llm/llm.service';
import { SupabaseService } from '../supabase.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';

function normalizeText(s: string) {
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(/[\W_]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !['a','an','the','and','or','but','is','are','was','were','of','in','on','for','to','with'].includes(w))
    .join(' ')
    .trim();
}

@Injectable()
export class ChatService {
  constructor(
    private readonly llm: LlmService,
    private readonly db: SupabaseService,
    private readonly embeddings: EmbeddingsService
  ) {}

  async handleMessage(studentId: string, message: string) {
    // compute embedding
    const emb = await this.embeddings.embed(message);

    // store message (with embedding where supported)
    try {
      await this.db.client.from('messages').insert([{ student_id: studentId, message, embedding: emb }]);
    } catch (e) {
      console.warn('Supabase insert failed', e?.message || e);
    }

    // retrieve relevant memories (nearest by cosine)
    let memoryPrompt = '';
    try {
      const res = await this.db.client.from('memories').select('*').eq('student_id', studentId);
      const rows = (res && res.data) || (Array.isArray(res) ? res : []);
      if (Array.isArray(rows) && rows.length > 0) {
        // compute similarity for each memory that has embedding
        const scored = rows
          .map((r: any) => {
            const mEmb = r.embedding;
            if (!mEmb || !Array.isArray(mEmb)) return { r, score: -1 };
            const score = this.embeddings.cosine(emb, mEmb);
            return { r, score };
          })
          .sort((a: any, b: any) => b.score - a.score)
          .slice(0, 3);

        memoryPrompt = scored.map((s: any) => s.r.value || s.r.key || '').join('\n');
      }
    } catch (e) {
      // ignore retrieval errors in prototype
    }

    if (!memoryPrompt) memoryPrompt = `Student ${studentId} memory: [none].`;

    const prompt = `${memoryPrompt}\nStudent asks: ${message}\nTeacher reply:`;
    const reply = await this.llm.query(prompt);

    // store reply
    try {
      await this.db.client.from('messages').insert([{ student_id: studentId, message: reply, role: 'ai', embedding: await this.embeddings.embed(reply) }]);
    } catch (e) {}

    return reply;
  }

  async createTestStudent() {
    const row: any = { name: 'Dev Student', age: 10, class: '5', board: 'CBSE' };
    // assign deterministic id so repeated calls return same id in mock only
    const isMock = !!(this.db && (this.db.client as any).isMock);
    if (isMock) {
      row.id = row.id || `dev-${randomUUID()}`;
    }

    try {
      const table = this.db.client.from('students');

      // Try common pattern: select().eq('name', ...)
      try {
        const q = table.select('*');
        if (q && typeof q.eq === 'function') {
          const found = await q.eq('name', row.name);
          const rows = (found && found.data) || (Array.isArray(found) ? found : []);
          if (rows && rows[0]) return rows[0];
        }
      } catch (e) {}

      // Try mock client's selectBuilder
      try {
        if (typeof table.selectBuilder === 'function') {
          const found = await table.selectBuilder('*').eq('name', row.name);
          const rows = (found && found.data) || (Array.isArray(found) ? found : []);
          if (rows && rows[0]) return rows[0];
        }
      } catch (e) {}

      // Fallback: fetch all and find
      try {
        const all = await table.select('*');
        const data = (all && all.data) || all || [];
        const existing = Array.isArray(data) ? data.find((d) => d.name === row.name) : null;
        if (existing) return existing;
      } catch (e) {}

      // Insert new student with preassigned id
      const res = await this.db.client.from('students').insert([row]).select();
      if (res && res.data && res.data[0]) return res.data[0];
      if (Array.isArray(res)) return res[0];
      return row;
    } catch (e) {
      console.warn('createTestStudent failed', e?.message || e);
      return row;
    }
  }

  async addMemory(studentId: string, key: string, value: string) {
    // Text-based normalization dedupe: check existing by student+key and normalized text
    const normNew = normalizeText(value || '');
    try {
      const table = this.db.client.from('memories');
      const maybeAll = await table.select('*');
      const rows = (maybeAll && maybeAll.data) || (Array.isArray(maybeAll) ? maybeAll : []);
      const existing = Array.isArray(rows) ? rows.find((r) => r.student_id === studentId && r.key === key) : null;
      if (existing) {
        const existingVal = existing.value || '';
        const normExisting = normalizeText(existingVal);
        if (normExisting && normExisting === normNew) {
          // texts are equivalent after normalization — return existing
          return existing;
        }

        // Not text-equal: compute embedding and update the existing row (overwrite)
        const emb = await this.embeddings.embed(value);
        try {
          const upd = await this.db.client.from('memories').update({ value, embedding: emb }).eq('id', existing.id).select();
          console.log('addMemory update result:', JSON.stringify(upd));
          if (upd && upd.data && upd.data[0]) return upd.data[0];
          if (Array.isArray(upd)) return upd[0];
          // fallback: return updated shape
          return { ...existing, value, embedding: emb };
        } catch (e) {
          console.warn('addMemory update failed', e?.message || e);
          return { ...existing, value, embedding: await this.embeddings.embed(value) };
        }
      }
    } catch (e) {
      // ignore dedupe errors and continue to insert
    }

    // No existing row: compute embedding and insert
    const emb = await this.embeddings.embed(value);
    const row = { student_id: studentId, key, value, embedding: emb };
    try {
      const res = await this.db.client.from('memories').insert([row]).select();
      console.log('addMemory insert result:', JSON.stringify(res));
      if (res && res.data && res.data[0]) return res.data[0];
      if (Array.isArray(res)) return res[0];
      return row;
    } catch (e) {
      console.warn('addMemory failed', e?.message || e);
      return row;
    }
  }

  async listAllMemories() {
    try {
      const res = await this.db.client.from('memories').select('*');
      const rows = (res && res.data) || (Array.isArray(res) ? res : []);
      return rows;
    } catch (e) {
      try {
        const res = await this.db.client.from('memories').select('*');
        return (res && res.data) || res || [];
      } catch (e) {
        return [];
      }
    }
  }

  async seedMemories(studentId: string) {
    const examples = [
      { key: 'weak_subject', value: 'fractions' },
      { key: 'favorite_subject', value: 'science' },
      { key: 'attention_span', value: '20 minutes' }
    ];
    const inserted: any[] = [];
    for (const e of examples) {
      const m = await this.addMemory(studentId, e.key, e.value);
      inserted.push(m);
    }
    return inserted;
  }

  async listMemories(studentId: string) {
    try {
      const res = await this.db.client.from('memories').select('*').eq('student_id', studentId);
      const rows = (res && res.data) || (Array.isArray(res) ? res : []);
      return rows;
    } catch (e) {
      // fallback for mock
      try {
        const res = await this.db.client.from('memories').select('*');
        const rows = (res && res.data) || res || [];
        return Array.isArray(rows) ? rows.filter((r) => r.student_id === studentId) : [];
      } catch (e) {
        return [];
      }
    }
  }

  async createStudent(payload: { name: string; age?: number; class?: string; board?: string }) {
    const row: any = {
      name: payload.name,
      age: payload.age || null,
      class: payload.class || null,
      board: payload.board || null
    };
    // If running with the mock client, assign a deterministic id so tests are repeatable.
    const isMock = !!(this.db && (this.db.client as any).isMock);
    if (isMock) row.id = row.id || `dev-${randomUUID()}`;
    try {
      const res = await this.db.client.from('students').insert([row]).select();
      if (res && res.data && res.data[0]) return res.data[0];
      if (Array.isArray(res)) return res[0];
      return row;
    } catch (e) {
      console.warn('createStudent failed', e?.message || e);
      return row;
    }
  }
}
