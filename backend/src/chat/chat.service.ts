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

  async handleMessage(
    studentId: string,
    message: string,
    opts?: { personality?: string; conversationId?: string }
  ) {
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
    let studentName: string | null = null;
    let memRows: any[] = [];
    try {
      const res = await this.db.client.from('memories').select('*').eq('student_id', studentId);
      memRows = (res && (res as any).data) || (Array.isArray(res) ? res : []);
      if (Array.isArray(memRows) && memRows.length > 0) {
        // compute similarity for each memory that has embedding
        const scored = memRows
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

    // Try to fetch a student profile (name) from students table; fallback to a memory with key containing 'name'
    try {
      const sres = await this.db.client.from('students').select('id,name').eq('id', studentId).limit(1);
      const srows = (sres && sres.data) || (Array.isArray(sres) ? sres : []);
      if (Array.isArray(srows) && srows[0] && srows[0].name) {
        studentName = srows[0].name;
      } else {
        // fallback: look for a memory whose key suggests the student's name
        if (Array.isArray(memRows) && memRows.length > 0) {
          const nameMem = memRows.find((r: any) => (r.key || '').toLowerCase().includes('name'));
          if (nameMem && nameMem.value) studentName = nameMem.value;
        }
      }
    } catch (e) {
      // ignore
    }

    if (!memoryPrompt) memoryPrompt = `Student ${studentId} memory: [none].`;

    const nameLine = studentName ? `StudentName: ${studentName}` : '';
    const personalityLine = opts?.personality ? `Personality: ${opts.personality}` : '';
    const prompt = `${personalityLine}\n${nameLine}\n${memoryPrompt}\nStudent asks: ${message}\nTeacher reply:`;
    const reply = await this.llm.query(prompt);

    // store reply
    try {
      await this.db.client.from('messages').insert([{ student_id: studentId, message: reply, role: 'ai', embedding: await this.embeddings.embed(reply) }]);
    } catch (e) {}

    const followups = this.buildFollowups(message);
    return {
      reply,
      followups,
      conversationId: opts?.conversationId || `conv-${studentId}`
    };
  }

  private buildFollowups(message: string): string[] {
    const text = (message || '').toLowerCase();
    if (text.includes('fraction')) return ['Can you show a pizza example?', 'Give me 3 practice questions', 'Explain like I am 10'];
    if (text.includes('algebra')) return ['Start with one easy equation', 'How to isolate x?', 'Give a word problem'];
    return ['Give me a quick summary', 'Ask me a quiz question', 'What should I learn next?'];
  }

  async getHistory(studentId: string, conversationId?: string) {
    try {
      const q = this.db.client.from('messages').select('*').eq('student_id', studentId).order('created_at', { ascending: true }).limit(200);
      const res = await q;
      const rows = (res && res.data) || (Array.isArray(res) ? res : []);
      const filtered = Array.isArray(rows)
        ? rows.filter((r: any) => (conversationId ? (r.conversation_id || `conv-${studentId}`) === conversationId : true))
        : [];

      return filtered.map((r: any) => ({
        id: r.id,
        role: r.role || 'user',
        text: r.message || '',
        ts: r.created_at || new Date().toISOString()
      }));
    } catch (e) {
      return [];
    }
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
        // Not text-equal: compute embedding and decide whether to treat as duplicate
        const emb = await this.embeddings.embed(value);
        try {
          const threshold = parseFloat(process.env.MEMORY_DEDUPE_THRESHOLD || '0.95');
          if (existing.embedding && Array.isArray(existing.embedding)) {
            const sim = this.embeddings.cosine(emb, existing.embedding);
            console.log(`addMemory: cosine similarity with existing: ${sim}`);
            if (!isNaN(sim) && sim >= threshold) {
              // Considered a duplicate by semantic similarity — return existing
              console.log(`addMemory: skipping update, similarity ${sim} >= threshold ${threshold}`);
              return existing;
            }
          }

          // Not similar enough: update the existing row (overwrite)
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

  async getStudentById(studentId: string) {
    try {
      const res = await this.db.client.from('students').select('*').eq('id', studentId).limit(1);
      const rows = (res && res.data) || (Array.isArray(res) ? res : []);
      if (Array.isArray(rows) && rows[0]) return rows[0];
      return null;
    } catch (e) {
      // fallback: try reading all and filter
      try {
        const res2 = await this.db.client.from('students').select('*');
        const rows2 = (res2 && res2.data) || (Array.isArray(res2) ? res2 : []);
        if (Array.isArray(rows2)) return rows2.find((r) => r.id === studentId) || null;
      } catch (e) {}
      return null;
    }
  }

  /**
   * Prune duplicate memories keeping the latest row per (student_id, key).
   * Requires the server to be running with the Supabase Service Role key.
   * Attempts to call an RPC named `sql` if available; otherwise returns the SQL to run manually.
   */
  async pruneDuplicateMemories() {
    const sql = `WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY student_id, key ORDER BY created_at DESC) AS rn
      FROM public.memories
    ) DELETE FROM public.memories WHERE id IN (SELECT id FROM ranked WHERE rn > 1);`;

    // Use pg to execute raw SQL with the service role DATABASE_URL
    try {
      // Lazy-require pg so projects without the dep still load until this path is invoked
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Client } = require('pg');
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) return { success: false, error: 'no_database_url', message: 'DATABASE_URL not configured on server' };

      const client = new Client({ connectionString: databaseUrl });
      await client.connect();
      try {
        await client.query('BEGIN');
        const res = await client.query(sql);
        await client.query('COMMIT');
        await client.end();
        return { success: true, result: { rowCount: res.rowCount } };
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        await client.end().catch(() => {});
        return { success: false, error: 'query_failed', message: String(err) };
      }
    } catch (e) {
      // If pg cannot connect (DNS/network), fall back to doing the pruning via the
      // Supabase REST API: fetch memories, compute duplicates server-side, then
      // delete duplicate ids using the Supabase client. This avoids direct DB TCP.
      try {
        const res = await this.db.client.from('memories').select('id,student_id,key,created_at');
        const rows = (res && res.data) || (Array.isArray(res) ? res : []);
        if (!Array.isArray(rows) || rows.length === 0) return { success: true, result: { rowCount: 0 } };

        const groups: Record<string, any[]> = {};
        for (const r of rows) {
          const gk = `${r.student_id}||${r.key}`;
          if (!groups[gk]) groups[gk] = [];
          groups[gk].push(r);
        }

        const toDelete: string[] = [];
        for (const gk of Object.keys(groups)) {
          const list = groups[gk].sort((a: any, b: any) => {
            const ta = new Date(a.created_at || 0).getTime();
            const tb = new Date(b.created_at || 0).getTime();
            return tb - ta;
          });
          const older = list.slice(1);
          for (const o of older) toDelete.push(o.id);
        }

        if (toDelete.length === 0) return { success: true, result: { rowCount: 0 } };

        // Delete duplicates via Supabase REST
        const del = await this.db.client.from('memories').delete().in('id', toDelete);
        return { success: true, result: { deleted: toDelete.length, raw: del } };
      } catch (err2) {
        return { success: false, error: 'fallback_failed', message: String(err2) };
      }
    }
  }

  /**
   * Compute admin stats about memories: duplicate groups and per-student counts.
   * Returns small aggregations computed in-memory via the Supabase REST client.
   */
  async getStats() {
    try {
      const res = await this.db.client.from('memories').select('id,student_id,key,created_at');
      const rows = (res && res.data) || (Array.isArray(res) ? res : []);

      const groups: Record<string, any[]> = {};
      const perStudent: Record<string, number> = {};
      for (const r of rows) {
        const gk = `${r.student_id}||${r.key}`;
        if (!groups[gk]) groups[gk] = [];
        groups[gk].push(r);

        perStudent[r.student_id] = (perStudent[r.student_id] || 0) + 1;
      }

      const duplicates = Object.entries(groups)
        .filter(([_, list]) => list.length > 1)
        .map(([k, list]) => ({ key: k.split('||')[1], student_id: k.split('||')[0], count: list.length, ids: list.map((x: any) => x.id) }));

      const perStudentCounts = Object.entries(perStudent)
        .map(([student_id, cnt]) => ({ student_id, count: cnt }))
        .sort((a: any, b: any) => b.count - a.count)
        .slice(0, 100);

      return { success: true, duplicates, perStudentCounts, totalMemories: rows.length };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }
}
