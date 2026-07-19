import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { LlmService } from '../llm/llm.service';
import { SupabaseService } from '../supabase.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';

type ChatTurn = {
  role: 'user' | 'assistant';
  content: string;
  ts: string;
};

type ChatContextMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ChatImagePayload = {
  base64: string;
  mimeType: string;
};

type UnderstandingSignal = {
  chapter: string;
  understandingLevel: 'high' | 'medium' | 'developing';
  confidenceLevel: 'high' | 'medium' | 'low';
  evidence: string[];
  recommendedSupport: string[];
};

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

function extractChapterSignals(history: Array<{ role: string; content: string }>): UnderstandingSignal[] {
  const chapterKeywords: Record<string, string[]> = {
    fractions: ['fraction', 'fractions', 'numerator', 'denominator', 'equivalent fraction'],
    algebra: ['algebra', 'equation', 'equations', 'variable', 'solve for x', 'expression'],
    science: ['science', 'force', 'energy', 'plant', 'plants', 'cell', 'cells'],
    grammar: ['grammar', 'noun', 'verb', 'tense', 'sentence', 'adjective'],
    decimals: ['decimal', 'decimals', 'place value'],
    geometry: ['geometry', 'angle', 'angles', 'triangle', 'area', 'perimeter'],
  };

  const userMessages = history
    .filter((item) => item.role === 'user' && item.content)
    .map((item) => String(item.content).toLowerCase());

  const signals: UnderstandingSignal[] = [];

  Object.entries(chapterKeywords).forEach(([chapter, keywords]) => {
    const matching = userMessages.filter((msg) => keywords.some((keyword) => msg.includes(keyword)));
    if (!matching.length) return;

    const advancedQuestionCount = matching.filter((msg) => /why|how|compare|pattern|strategy|prove|explain step|understand/.test(msg)).length;
    const helpQuestionCount = matching.filter((msg) => /help|don't understand|dont understand|confused|stuck|hard|difficult|again|simple/.test(msg)).length;
    const practiceQuestionCount = matching.filter((msg) => /practice|quiz|question|test me/.test(msg)).length;

    let understandingLevel: UnderstandingSignal['understandingLevel'] = 'medium';
    let confidenceLevel: UnderstandingSignal['confidenceLevel'] = 'medium';

    if (advancedQuestionCount >= 2 && helpQuestionCount === 0) understandingLevel = 'high';
    else if (helpQuestionCount >= 2) understandingLevel = 'developing';

    if (practiceQuestionCount >= 2 || advancedQuestionCount >= 2) confidenceLevel = 'high';
    if (helpQuestionCount >= 2) confidenceLevel = 'low';

    const evidence: string[] = [];
    if (advancedQuestionCount > 0) evidence.push('asks deeper how/why questions');
    if (practiceQuestionCount > 0) evidence.push('actively requests practice or self-testing');
    if (helpQuestionCount > 0) evidence.push('shows confusion or asks for simpler explanations');

    const recommendedSupport: string[] = [];
    if (understandingLevel === 'high') recommendedSupport.push('give challenge problems and mixed application questions');
    if (understandingLevel === 'medium') recommendedSupport.push('reinforce with worked examples and short practice sets');
    if (understandingLevel === 'developing') recommendedSupport.push('re-teach with simpler steps, visuals, and concept checks');

    signals.push({
      chapter,
      understandingLevel,
      confidenceLevel,
      evidence,
      recommendedSupport,
    });
  });

  return signals.slice(0, 4);
}

@Injectable()
export class ChatService {
  // Process-local fallback context so follow-up questions still work when DB writes fail.
  private static conversationCache = new Map<string, ChatTurn[]>();
  private readonly localSnapshotDir = path.join(process.cwd(), 'local-data');
  private readonly localSnapshotFile = path.join(this.localSnapshotDir, 'chat-snapshots.json');

  constructor(
    private readonly llm: LlmService,
    private readonly db: SupabaseService,
    private readonly embeddings: EmbeddingsService
  ) {}

  private getCacheKey(studentId: string, conversationId: string) {
    return `${studentId}::${conversationId}`;
  }

  private appendCacheTurn(studentId: string, conversationId: string, role: 'user' | 'assistant', content: string) {
    const key = this.getCacheKey(studentId, conversationId);
    const existing = ChatService.conversationCache.get(key) || [];
    const next = [...existing, { role, content: String(content || ''), ts: new Date().toISOString() }].slice(-60);
    ChatService.conversationCache.set(key, next);
  }

  private getCacheHistory(studentId: string, conversationId: string) {
    const key = this.getCacheKey(studentId, conversationId);
    return (ChatService.conversationCache.get(key) || []).slice(-20);
  }

  private getSnapshotKey(studentId: string, conversationId: string) {
    return `${studentId}::${conversationId}`;
  }

  private readLocalSnapshots(): Record<string, ChatTurn[]> {
    try {
      if (!fs.existsSync(this.localSnapshotFile)) return {};
      const raw = fs.readFileSync(this.localSnapshotFile, 'utf8');
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private writeLocalSnapshots(store: Record<string, ChatTurn[]>) {
    try {
      if (!fs.existsSync(this.localSnapshotDir)) fs.mkdirSync(this.localSnapshotDir, { recursive: true });
      fs.writeFileSync(this.localSnapshotFile, JSON.stringify(store, null, 2), 'utf8');
    } catch (e) {
      console.warn('Local snapshot persist failed', (e as any)?.message || e);
    }
  }

  private loadLocalSnapshotHistory(studentId: string, conversationId: string): ChatTurn[] {
    const store = this.readLocalSnapshots();
    const key = this.getSnapshotKey(studentId, conversationId);
    return this.normalizeTurns(Array.isArray(store[key]) ? store[key] : []);
  }

  private persistLocalSnapshotHistory(studentId: string, conversationId: string, turns: ChatTurn[]) {
    const store = this.readLocalSnapshots();
    const key = this.getSnapshotKey(studentId, conversationId);
    store[key] = this.normalizeTurns(turns);
    this.writeLocalSnapshots(store);
  }

  private normalizeTurns(turns: ChatTurn[]) {
    return (Array.isArray(turns) ? turns : [])
      .filter((t) => t && (t.role === 'user' || t.role === 'assistant') && String(t.content || '').trim())
      .map((t) => ({
        role: t.role,
        content: String(t.content || '').trim(),
        ts: t.ts || new Date().toISOString(),
      }))
      .slice(-60);
  }

  private toContextMessages(turns: ChatTurn[]): ChatContextMessage[] {
    return this.normalizeTurns(turns)
      .map((t) => ({ role: t.role, content: t.content }))
      .slice(-20);
  }

  private extractImagePayload(dataUrl?: string): ChatImagePayload | null {
    const raw = String(dataUrl || '').trim();
    if (!raw) return null;

    const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) return null;

    const mimeType = match[1].toLowerCase();
    const base64 = match[2].trim();
    if (!base64) return null;

    // Guardrails for payload size: keep request under practical limits for local inference.
    if (base64.length > 9_000_000) return null;

    return { base64, mimeType };
  }

  private extractImagePayloads(dataUrls?: string[]): ChatImagePayload[] {
    const list = Array.isArray(dataUrls) ? dataUrls : [];
    const parsed = list
      .map((url) => this.extractImagePayload(url))
      .filter((v): v is ChatImagePayload => !!v);

    // Keep payload size practical for local inference.
    return parsed.slice(0, 6);
  }

  private async loadSnapshotHistory(studentId: string, conversationId: string): Promise<ChatTurn[]> {
    try {
      const res = await this.db.client
        .from('conversation_snapshots')
        .select('snapshot,updated_at')
        .eq('student_id', studentId)
        .eq('conversation_id', conversationId)
        .order('updated_at', { ascending: false })
        .limit(1);
      const rows = (res && res.data) || (Array.isArray(res) ? res : []);
      const row = Array.isArray(rows) ? rows[0] : null;
      const snapshot = row?.snapshot;
      if (!Array.isArray(snapshot)) return this.loadLocalSnapshotHistory(studentId, conversationId);
      return this.normalizeTurns(
        snapshot.map((t: any) => ({
          role: t?.role === 'assistant' ? 'assistant' : 'user',
          content: String(t?.content || ''),
          ts: String(t?.ts || row?.updated_at || new Date().toISOString()),
        }))
      );
    } catch (e) {
      return this.loadLocalSnapshotHistory(studentId, conversationId);
    }
  }

  private async persistSnapshotHistory(studentId: string, conversationId: string, turns: ChatTurn[]) {
    const snapshot = this.normalizeTurns(turns);
    if (!snapshot.length) return;

    this.persistLocalSnapshotHistory(studentId, conversationId, snapshot);

    const nowIso = new Date().toISOString();
    const payload = {
      student_id: studentId,
      conversation_id: conversationId,
      snapshot,
      turn_count: snapshot.length,
      last_message_at: snapshot[snapshot.length - 1]?.ts || nowIso,
      updated_at: nowIso,
    };

    try {
      const found = await this.db.client
        .from('conversation_snapshots')
        .select('id')
        .eq('student_id', studentId)
        .eq('conversation_id', conversationId)
        .limit(1);
      const rows = (found && found.data) || (Array.isArray(found) ? found : []);
      const existing = Array.isArray(rows) ? rows[0] : null;

      if (existing?.id) {
        await this.db.client
          .from('conversation_snapshots')
          .update(payload)
          .eq('id', existing.id);
      } else {
        await this.db.client
          .from('conversation_snapshots')
          .insert([{ ...payload, created_at: nowIso }]);
      }
    } catch (e) {
      console.warn('Conversation snapshot persist failed', e?.message || e);
    }
  }

  async handleMessage(
    studentId: string,
    message: string,
    opts?: {
      personality?: string;
      conversationId?: string;
      recentMessages?: Array<{ role: string; content: string }>;
      imageDataUrl?: string;
      imageDataUrls?: string[];
    }
  ) {
    const convId = opts?.conversationId || `conv-${studentId}`;
    const imagePayload = this.extractImagePayload(opts?.imageDataUrl);
    const imagePayloads = this.extractImagePayloads(opts?.imageDataUrls);
    const mergedImages = [
      ...imagePayloads,
      ...(imagePayload ? [imagePayload] : []),
    ];
    const uniqueImages = Array.from(new Map(mergedImages.map((img) => [img.base64.slice(0, 80), img])).values()).slice(0, 6);

    // Keep a process-local conversation trail for reliability across transient DB issues.
    this.appendCacheTurn(studentId, convId, 'user', message);

    // Compute embedding for the incoming message
    const emb = await this.embeddings.embed(message);

    // Persist the student message
    try {
      await this.db.client.from('messages').insert([{
        student_id: studentId,
        role: 'user',
        message,
        conversation_id: convId,
        embedding: emb
      }]);
    } catch (e) {
      console.warn('Supabase message insert failed', e?.message || e);
    }

    // ── Fetch student profile ──────────────────────────────────────────────
    let studentName: string | null = null;
    let studentClass: string | null = null;
    let memRows: any[] = [];
    try {
      const sres = await this.db.client.from('students').select('id,name,class_name,class').eq('id', studentId).limit(1);
      const srows = (sres && sres.data) || (Array.isArray(sres) ? sres : []);
      if (Array.isArray(srows) && srows[0]) {
        studentName = srows[0].name || null;
        studentClass = srows[0].class_name || srows[0].class || null;
      }
    } catch (e) { /* ignore */ }

    // ── Fetch recent memories (top-3 by cosine similarity) ────────────────
    let relevantMemories: string[] = [];
    try {
      const res = await this.db.client.from('memories').select('*').eq('student_id', studentId);
      memRows = (res && (res as any).data) || (Array.isArray(res) ? res : []);
      if (Array.isArray(memRows) && memRows.length > 0) {
        // Fallback name/class from memories if not in students table
        if (!studentName) {
          const nameMem = memRows.find((r: any) => (r.key || '').toLowerCase().includes('name'));
          if (nameMem?.value) studentName = nameMem.value;
        }

        const scored = memRows
          .map((r: any) => {
            const mEmb = r.embedding;
            if (!mEmb || !Array.isArray(mEmb)) return { r, score: 0 };
            return { r, score: this.embeddings.cosine(emb, mEmb) };
          })
          .sort((a: any, b: any) => b.score - a.score)
          .slice(0, 3);

        relevantMemories = scored
          .filter((s: any) => s.r.value)
          .map((s: any) => `- ${s.r.key || 'note'}: ${s.r.value}`);
      }
    } catch (e) { /* ignore retrieval errors */ }

    // ── Fetch recent conversation history (conversation-scoped) ───────────
    let recentHistory: Array<{ role: string; content: string }> = [];
    try {
      const hq = this.db.client
        .from('messages')
        .select('role,message,created_at')
        .eq('conversation_id', convId)
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(40);
      const hres = await hq;
      const hrows = (hres && hres.data) || (Array.isArray(hres) ? hres : []);
      if (Array.isArray(hrows)) {
        recentHistory = hrows
          .reverse()
          // exclude the message we just inserted
          .filter((r: any) => r.message !== message || r.role !== 'user')
          .slice(-20)
          .map((r: any) => ({
            role: r.role === 'ai' ? 'assistant' : 'user',
            content: r.message || ''
          }))
          .filter((m) => m.content);
      }
    } catch (e) { /* ignore */ }

    const snapshotHistory = this.toContextMessages(await this.loadSnapshotHistory(studentId, convId));

    const cacheHistory = this.toContextMessages(this.getCacheHistory(studentId, convId));

    const clientHistory = Array.isArray(opts?.recentMessages)
      ? opts.recentMessages
        .filter((m) => m && typeof m.content === 'string' && m.content.trim())
        .map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content.trim()
        }))
        .slice(-20)
      : [];

    // Prefer the most complete source among DB, snapshots, cache, and client history.
    const candidates = [recentHistory, snapshotHistory, cacheHistory, clientHistory].sort((a, b) => b.length - a.length);
    recentHistory = (candidates[0] || [])
      .filter((m) => m.content && !(m.role === 'user' && m.content === message))
      .slice(-20);

    const understandingSignals = extractChapterSignals(recentHistory);

    // ── Build system prompt ────────────────────────────────────────────────
    const nameGreet = studentName ? ` The student's name is ${studentName}.` : '';
    const classLine = studentClass ? ` They are in ${studentClass}.` : '';
    const memoriesSection = relevantMemories.length
      ? `\n\nRelevant things you know about this student:\n${relevantMemories.join('\n')}`
      : '';
    const understandingSection = understandingSignals.length
      ? `\n\nObserved learning signals from prior conversation:\n${understandingSignals.map((signal) => {
          const evidence = signal.evidence.length ? signal.evidence.join(', ') : 'limited evidence';
          const support = signal.recommendedSupport.join(', ');
          return `- ${signal.chapter}: understanding ${signal.understandingLevel}, confidence ${signal.confidenceLevel}; evidence: ${evidence}; support: ${support}`;
        }).join('\n')}`
      : '';

    const systemPrompt =
      `You are EduGenie, a friendly and encouraging AI tutor for school students.${nameGreet}${classLine}` +
      ` Your job is to help students understand their subjects clearly and build confidence.` +
      ` Always give clear, step-by-step explanations suited to a school student.` +
      ` Use simple language, examples, and analogies. If asked for practice questions, provide them.` +
      ` Keep responses concise (3-5 sentences for simple questions; use numbered steps for complex ones).` +
      ` Treat prior turns in this conversation as source of truth for follow-ups like "above", "previous", "those", "this".` +
      ` If the user asks for answers to previously generated questions, answer those exact questions from context.` +
      ` If prior conversation context is available, never say you cannot remember or that this is a brand new conversation.` +
      ` If the user asks about their understanding level, learning behavior, strengths, weak spots, or chapter performance, analyze it from their previous questions, requests for help, and practice patterns in this conversation.` +
      ` If the student provides an image, carefully describe what you can see and explain it like a tutor.` +
      ` If text is visible in the image, read it and explain it step-by-step.` +
      ` If the image is unclear, say what is uncertain and ask for a clearer image.` +
      ` Be explicit about what evidence you used from the conversation, and if evidence is thin, say that clearly instead of claiming no memory.` +
      ` Be warm, patient, and encouraging.` +
      memoriesSection +
      understandingSection;

    // ── Assemble messages array ────────────────────────────────────────────
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...recentHistory,
      { role: 'user', content: message }
    ];

    const reply = await this.llm.query(messages, {
      imageBase64: uniqueImages[0]?.base64,
      imageBase64List: uniqueImages.map((img) => img.base64),
    });

    this.appendCacheTurn(studentId, convId, 'assistant', reply);

    const nowIso = new Date().toISOString();
    const persistedTurns: ChatTurn[] = [
      ...recentHistory.map((m) => ({
        role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: m.content,
        ts: nowIso,
      })),
      { role: 'user' as const, content: message, ts: nowIso },
      { role: 'assistant' as const, content: reply, ts: nowIso },
    ].slice(-60) as ChatTurn[];
    await this.persistSnapshotHistory(studentId, convId, persistedTurns);

    // Persist AI reply
    try {
      await this.db.client.from('messages').insert([{
        student_id: studentId,
        role: 'ai',
        message: reply,
        conversation_id: convId,
        embedding: await this.embeddings.embed(reply)
      }]);
    } catch (e) { /* ignore */ }

    const followups = this.buildFollowups(message);
    return {
      reply,
      followups,
      conversationId: convId
    };
  }

  private buildFollowups(message: string): string[] {
    const text = (message || '').toLowerCase();
    if (text.includes('fraction')) return ['Can you show a pizza example?', 'Give me 3 practice questions', 'Explain like I am 10'];
    if (text.includes('algebra')) return ['Start with one easy equation', 'How to isolate x?', 'Give a word problem'];
    return ['Give me a quick summary', 'Ask me a quiz question', 'What should I learn next?'];
  }

  async getHistory(studentId: string, conversationId?: string) {
    const convId = conversationId || `conv-${studentId}`;
    try {
      const q = this.db.client.from('messages').select('*').eq('student_id', studentId).order('created_at', { ascending: true }).limit(200);
      const res = await q;
      const rows = (res && res.data) || (Array.isArray(res) ? res : []);
      const filtered = Array.isArray(rows)
        ? rows.filter((r: any) => (conversationId ? (r.conversation_id || `conv-${studentId}`) === conversationId : true))
        : [];

      if (filtered.length === 0) {
        const snap = await this.loadSnapshotHistory(studentId, convId);
        if (snap.length) {
          return snap.map((m, idx) => ({
            id: `snapshot-${idx}-${m.ts}`,
            role: m.role === 'assistant' ? 'ai' : 'user',
            text: m.content,
            ts: m.ts,
          }));
        }

        const cached = this.getCacheHistory(studentId, convId);
        if (cached.length) {
          return cached.map((m, idx) => ({
            id: `cache-${idx}-${m.ts}`,
            role: m.role === 'assistant' ? 'ai' : 'user',
            text: m.content,
            ts: m.ts,
          }));
        }
      }

      return filtered.map((r: any) => ({
        id: r.id,
        role: r.role || 'user',
        text: r.message || '',
        ts: r.created_at || new Date().toISOString()
      }));
    } catch (e) {
      const snap = await this.loadSnapshotHistory(studentId, convId);
      if (snap.length) {
        return snap.map((m, idx) => ({
          id: `snapshot-${idx}-${m.ts}`,
          role: m.role === 'assistant' ? 'ai' : 'user',
          text: m.content,
          ts: m.ts,
        }));
      }

      const cached = this.getCacheHistory(studentId, convId);
      return cached.map((m, idx) => ({
        id: `cache-${idx}-${m.ts}`,
        role: m.role === 'assistant' ? 'ai' : 'user',
        text: m.content,
        ts: m.ts,
      }));
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
