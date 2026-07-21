import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import fetch from 'node-fetch';
import { LlmService } from '../llm/llm.service';
import { SupabaseService } from '../supabase.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';

type ChatTurn = {
  role: 'user' | 'assistant';
  content: string;
  ts: string;
  imageDataUrl?: string;
  imageName?: string;
  imageDataUrls?: string[];
  imageNames?: string[];
  lessonId?: string;
  lessonTitle?: string;
  lessonSubject?: string;
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

type LessonMasterySubtopic = {
  name: string;
  status: 'covered' | 'needs_practice' | 'next';
  confidence: 'strong' | 'building' | 'needs-support';
  evidence: string;
};

const CONTEXT_EMOJI_RULES: Array<{ pattern: RegExp; emoji: string }> = [
  { pattern: /\b(building|construction|tower|apartment|office)\b/i, emoji: '🏢' },
  { pattern: /\b(city|town|street|road|route|trip|travel|map|drive|car)\b/i, emoji: '🗺️' },
  { pattern: /\b(book|study|lesson|chapter|school|classroom)\b/i, emoji: '📚' },
  { pattern: /\b(plant|tree|leaf|garden|flower|nature|seed)\b/i, emoji: '🌱' },
  { pattern: /\b(star|success|great|excellent|well done|good job)\b/i, emoji: '🌟' },
  { pattern: /\b(pizza|cake|apple|fruit|food|chocolate)\b/i, emoji: '🍕' },
  { pattern: /\b(ball|game|sports|playground|cricket|football)\b/i, emoji: '⚽' },
  { pattern: /\b(shop|money|coins|market|buy|sell)\b/i, emoji: '🛒' },
  { pattern: /\b(science|lab|experiment|magnet|energy|force)\b/i, emoji: '🔬' },
  { pattern: /\b(math|geometry|coordinate|graph|point|line|angle)\b/i, emoji: '📐' },
];

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

function toLessonMasterySubtopics(signals: UnderstandingSignal[]): LessonMasterySubtopic[] {
  if (!Array.isArray(signals) || !signals.length) {
    return [
      {
        name: 'lesson basics',
        status: 'next',
        confidence: 'building',
        evidence: 'not enough lesson evidence yet'
      }
    ];
  }

  return signals.slice(0, 5).map((signal, index) => {
    const confidence: LessonMasterySubtopic['confidence'] = signal.understandingLevel === 'high'
      ? 'strong'
      : signal.understandingLevel === 'developing'
        ? 'needs-support'
        : 'building';
    const status: LessonMasterySubtopic['status'] = signal.understandingLevel === 'high'
      ? 'covered'
      : index === 0
        ? 'next'
        : 'needs_practice';

    return {
      name: signal.chapter,
      status,
      confidence,
      evidence: signal.evidence.join(', ') || 'lesson discussion evidence'
    };
  });
}

function containsEmoji(text: string) {
  return /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(String(text || ''));
}

function addContextualEmojis(reply: string) {
  let output = String(reply || '').trim();
  if (!output) return output;

  const normalizeSectionLine = (text: string, pattern: RegExp, heading: string) => {
    return text.replace(pattern, (_full, tail = '') => {
      const suffix = String(tail || '').trim();
      return suffix ? `- **${heading}:** ${suffix}` : `- **${heading}:**`;
    });
  };

  output = normalizeSectionLine(
    output,
    /^\s*(?:[-*]\s*)?(?:\d+[.)]\s*)?(?:\*\*)?\s*(?:concept|key concept)\s*(?:\*\*)?\s*:?\s*(.*)$/gim,
    'Concept 💡'
  );
  output = normalizeSectionLine(
    output,
    /^\s*(?:[-*]\s*)?(?:\d+[.)]\s*)?(?:\*\*)?\s*(?:real[- ]?life example|example)\s*(?:\*\*)?\s*:?\s*(.*)$/gim,
    'Example 🌍'
  );
  output = normalizeSectionLine(
    output,
    /^\s*(?:[-*]\s*)?(?:\d+[.)]\s*)?(?:\*\*)?\s*(?:try this|your turn|practice)\s*(?:\*\*)?\s*:?\s*(.*)$/gim,
    'Try This ✍️'
  );
  output = normalizeSectionLine(
    output,
    /^\s*(?:[-*]\s*)?(?:\d+[.)]\s*)?(?:\*\*)?\s*(?:next step|what next|what to cover next)\s*(?:\*\*)?\s*:?\s*(.*)$/gim,
    'Next Step 🚀'
  );

  output = output.replace(/\*\*(real[- ]?life example|example)\*\*:?/i, '- **Example 🌍:**');
  output = output.replace(/\*\*(how it works|how to solve|solution steps|steps)\*\*:?/i, '- **Concept 💡:**');
  output = output.replace(/\*\*(next step|what next|what to cover next)\*\*:?/i, '- **Next Step 🚀:**');

  if (!/\*\*Next Step 🚀:\*\*/i.test(output)) {
    const nextStepMatch = output.match(/(what should come next[^.?!]*[.?!]|you can cover next[^.?!]*[.?!]|next,? you should study[^.?!]*[.?!]|the next part to learn is[^.?!]*[.?!])/i);
    if (nextStepMatch) {
      const nextStepText = String(nextStepMatch[0] || '').trim();
      output = output.replace(nextStepMatch[0], '').trim();
      output = `${output}\n\n- **Next Step 🚀:** ${nextStepText}`.trim();
    }
  }

  let inserted = containsEmoji(output) ? 1 : 0;
  for (const rule of CONTEXT_EMOJI_RULES) {
    if (inserted >= 3) break;
    if (output.includes(rule.emoji)) continue;
    if (!rule.pattern.test(output)) continue;
    output = output.replace(rule.pattern, (match) => `${match} ${rule.emoji}`);
    inserted += 1;
  }

  if (!containsEmoji(output) && /\b(example|imagine|think of)\b/i.test(output)) {
    output = `🌟 ${output}`;
  }

  return output;
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

  private appendCacheTurn(studentId: string, conversationId: string, turn: ChatTurn) {
    const key = this.getCacheKey(studentId, conversationId);
    const existing = ChatService.conversationCache.get(key) || [];
    const next = [...existing, this.normalizeTurns([turn])[0]].filter(Boolean).slice(-60) as ChatTurn[];
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
        imageDataUrl: String(t.imageDataUrl || '').trim() || undefined,
        imageName: String(t.imageName || '').trim() || undefined,
        imageDataUrls: Array.isArray(t.imageDataUrls)
          ? t.imageDataUrls.map((url) => String(url || '').trim()).filter(Boolean).slice(0, 6)
          : undefined,
        imageNames: Array.isArray(t.imageNames)
          ? t.imageNames.map((name) => String(name || '').trim()).filter(Boolean).slice(0, 6)
          : undefined,
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

  private buildMessageMetadata(turn?: Partial<ChatTurn> | null) {
    const imageDataUrls = Array.isArray(turn?.imageDataUrls)
      ? turn.imageDataUrls.map((url) => String(url || '').trim()).filter(Boolean).slice(0, 6)
      : [];
    const imageNames = Array.isArray(turn?.imageNames)
      ? turn.imageNames.map((name) => String(name || '').trim()).filter(Boolean).slice(0, 6)
      : [];
    const imageDataUrl = String(turn?.imageDataUrl || '').trim();
    const imageName = String(turn?.imageName || '').trim();

    return {
      imageDataUrl: imageDataUrl || imageDataUrls[0] || null,
      imageName: imageName || imageNames[0] || null,
      imageDataUrls,
      imageNames,
    };
  }

  private readMessageMetadata(row: any) {
    const meta = row?.message_metadata && typeof row.message_metadata === 'object' ? row.message_metadata : {};
    const imageDataUrls = Array.isArray(meta?.imageDataUrls)
      ? meta.imageDataUrls.map((url: any) => String(url || '').trim()).filter(Boolean).slice(0, 6)
      : [];
    const imageNames = Array.isArray(meta?.imageNames)
      ? meta.imageNames.map((name: any) => String(name || '').trim()).filter(Boolean).slice(0, 6)
      : [];
    const imageDataUrl = String(meta?.imageDataUrl || '').trim();
    const imageName = String(meta?.imageName || '').trim();

    return {
      imageDataUrl: imageDataUrl || imageDataUrls[0] || '',
      imageName: imageName || imageNames[0] || '',
      imageDataUrls,
      imageNames,
    };
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
          imageDataUrl: typeof t?.imageDataUrl === 'string' ? t.imageDataUrl : '',
          imageName: typeof t?.imageName === 'string' ? t.imageName : '',
          imageDataUrls: Array.isArray(t?.imageDataUrls) ? t.imageDataUrls : [],
          imageNames: Array.isArray(t?.imageNames) ? t.imageNames : [],
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
      imageNames?: string[];
      lessonId?: string;
      lessonTitle?: string;
      lessonSubject?: string;
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
    const userTurn: ChatTurn = {
      role: 'user',
      content: message,
      ts: new Date().toISOString(),
      imageDataUrl: uniqueImages[0] ? `data:${uniqueImages[0].mimeType};base64,${uniqueImages[0].base64}` : undefined,
      imageDataUrls: uniqueImages.map((img) => `data:${img.mimeType};base64,${img.base64}`),
      imageNames: Array.isArray(opts?.imageNames)
        ? opts.imageNames.map((name) => String(name || '').trim()).filter(Boolean).slice(0, 6)
        : undefined,
      imageName: Array.isArray(opts?.imageNames) && opts.imageNames.length
        ? String(opts.imageNames[0] || '').trim() || undefined
        : undefined,
      lessonId: String(opts?.lessonId || '').trim() || undefined,
      lessonTitle: String(opts?.lessonTitle || '').trim() || undefined,
      lessonSubject: String(opts?.lessonSubject || '').trim() || undefined,
    };
    // ── Fetch curriculum context for the selected lesson/subject ─────────
    let lessonContextSection = '';
    let lessonTitle = String(opts?.lessonTitle || '').trim();
    let lessonSubject = String(opts?.lessonSubject || '').trim();
    const lessonId = String(opts?.lessonId || '').trim();
    let profileRow: any = null;
    this.appendCacheTurn(studentId, convId, userTurn);

    // Compute embedding for the incoming message
    const emb = await this.embeddings.embed(message);

    try {
      const profileRes = await this.db.client
        .from('students')
        .select('id,name,class_name,class')
        .eq('id', studentId)
        .limit(1);
      const profileRows = Array.isArray((profileRes as any)?.data) ? (profileRes as any).data : [];
      profileRow = profileRows[0] || null;

      if (lessonId) {
        const lessonRes = await this.db.client.from('lessons').select('*').eq('id', lessonId).limit(1);
        const lessonRow = Array.isArray((lessonRes as any)?.data) ? (lessonRes as any).data[0] : null;
        if (lessonRow) {
          lessonTitle = lessonTitle || String(lessonRow.title || '').trim();
          lessonSubject = lessonSubject || String(lessonRow.subject || '').trim();

          const chunksRes = await this.db.client
            .from('lesson_chunks')
            .select('*')
            .eq('lesson_id', lessonId)
            .order('created_at', { ascending: true });
          const chunks = Array.isArray((chunksRes as any)?.data) ? (chunksRes as any).data : [];
          if (chunks.length) {
            const scored = chunks
              .map((chunk: any) => {
                const chunkEmb = Array.isArray(chunk?.embedding) ? chunk.embedding : null;
                const score = chunkEmb ? this.embeddings.cosine(emb, chunkEmb) : 0;
                return { chunk, score };
              })
              .sort((a: any, b: any) => b.score - a.score)
              .slice(0, 8);

            lessonContextSection = `\n\nSelected lesson context: ${lessonTitle || 'Untitled lesson'}${lessonSubject ? ` (${lessonSubject})` : ''}\n${scored.map(({ chunk }, idx) => `${idx + 1}. ${String(chunk?.chunk_text || '').trim()}`).filter(Boolean).join('\n')}`;
          } else {
            lessonContextSection = `\n\nSelected lesson context: ${lessonTitle || 'Untitled lesson'}${lessonSubject ? ` (${lessonSubject})` : ''}`;
          }
        }
      } else if (lessonSubject) {
        const className = String(profileRow?.class_name || profileRow?.class || '').trim();
        if (className) {
          const visibleRes = await this.db.client
            .from('lesson_visibility')
            .select('lesson_id')
            .eq('class_name', className)
            .eq('visible', true);
          const visibleRows = Array.isArray((visibleRes as any)?.data) ? (visibleRes as any).data : [];
          const visibleLessonIds = Array.from(new Set(visibleRows.map((row: any) => String(row?.lesson_id || '').trim()).filter(Boolean)));

          if (visibleLessonIds.length) {
            const lessonsRes = await this.db.client
              .from('lessons')
              .select('id,title,subject')
              .in('id', visibleLessonIds)
              .ilike('subject', lessonSubject);
            const lessons = Array.isArray((lessonsRes as any)?.data) ? (lessonsRes as any).data : [];
            const lessonIdsBySubject = Array.from(new Set(lessons.map((row: any) => String(row?.id || '').trim()).filter(Boolean)));
            const lessonTitleById = new Map(lessons.map((row: any) => [String(row?.id || ''), String(row?.title || 'Untitled lesson')]));

            if (lessonIdsBySubject.length) {
              const chunksRes = await this.db.client
                .from('lesson_chunks')
                .select('lesson_id,chunk_text,embedding,page_number')
                .in('lesson_id', lessonIdsBySubject)
                .order('created_at', { ascending: true });
              const chunks = Array.isArray((chunksRes as any)?.data) ? (chunksRes as any).data : [];
              const scored = chunks
                .map((chunk: any) => {
                  const chunkEmb = Array.isArray(chunk?.embedding) ? chunk.embedding : null;
                  const score = chunkEmb ? this.embeddings.cosine(emb, chunkEmb) : 0;
                  return { chunk, score };
                })
                .sort((a: any, b: any) => b.score - a.score)
                .slice(0, 10);

              if (scored.length) {
                const summarized = scored
                  .map(({ chunk }, idx) => {
                    const srcLessonId = String(chunk?.lesson_id || '').trim();
                    const srcTitle = lessonTitleById.get(srcLessonId) || 'Untitled lesson';
                    const pagePart = chunk?.page_number ? ` [p.${chunk.page_number}]` : '';
                    return `${idx + 1}. ${srcTitle}${pagePart}: ${String(chunk?.chunk_text || '').trim()}`;
                  })
                  .filter(Boolean)
                  .join('\n');
                lessonContextSection = `\n\nSelected subject context: ${lessonSubject} (all visible lessons for class ${className})\n${summarized}`;
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('lesson context lookup failed', e?.message || e);
    }

    // Persist the student message
    try {
      await this.db.client.from('messages').insert([{
        student_id: studentId,
        role: 'user',
        message,
        message_metadata: this.buildMessageMetadata(userTurn),
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
      const srows = profileRow ? [profileRow] : [];
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
        .select('role,message,created_at,message_metadata')
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
    const lessonProgressSummary = understandingSignals.length
      ? understandingSignals.map((signal) => {
          const support = signal.recommendedSupport.length ? signal.recommendedSupport.join(', ') : 'continue guided practice';
          return `${signal.chapter}: understanding ${signal.understandingLevel}, confidence ${signal.confidenceLevel}, next support: ${support}`;
        }).join(' | ')
      : 'Limited evidence so far. Start with basics, check understanding, and build gradually.';

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
      (lessonTitle ? ` Stay focused on the selected lesson: ${lessonTitle}${lessonSubject ? ` (${lessonSubject})` : ''}.` : '') +
      ` Always give clear, step-by-step explanations suited to a school student.` +
      ` Use simple language, examples, and analogies. If asked for practice questions, provide them.` +
      ` Keep the teaching load light: explain one concept at a time, then ask one short check question before moving ahead.` +
      ` Prefer short, friendly outputs with tiny steps and practical real-life examples.` +
      ` You may use a small number of simple, school-friendly emojis to make examples feel lively and encouraging.` +
      ` Match emojis to the example when natural, like buildings for construction, plants for nature, books for study, or stars for success.` +
      ` Keep emoji use light: usually 0 to 3 per reply, never every sentence, and never in a distracting way.` +
      ` Keep responses concise (3-5 sentences for simple questions; use numbered steps for complex ones).` +
      ` When a lesson is selected, treat the uploaded lesson PDF as the main teaching boundary.` +
      ` In lesson mode, only teach concepts that are present in or directly required by that selected lesson context.` +
      ` Do not drift into other chapters, extra syllabus areas, or advanced depth beyond school level unless the student explicitly asks to switch topics.` +
      ` If the student asks something outside the selected lesson, gently say it is outside this lesson and bring them back to the current lesson.` +
      ` In lesson mode, maintain a running sense of progress inside this lesson: what the student seems to know, where they need help, what has been covered, and what should come next.` +
      ` After helping with a concept in lesson mode, briefly anchor the student by mentioning either what part of the lesson was just covered or what small part should come next.` +
      ` If the student is showing strong understanding inside this lesson, say they are getting strong in this lesson and suggest the next remaining concept from the lesson before suggesting any broader topic.` +
      ` Never present yourself as teaching the full subject when a specific lesson is selected; stay bounded to that lesson.` +
      ` Treat prior turns in this conversation as source of truth for follow-ups like "above", "previous", "those", "this".` +
      ` If the user asks for answers to previously generated questions, answer those exact questions from context.` +
      ` If prior conversation context is available, never say you cannot remember or that this is a brand new conversation.` +
      ` If the user asks about their understanding level, learning behavior, strengths, weak spots, or chapter performance, analyze it from their previous questions, requests for help, and practice patterns in this conversation.` +
      ` If the student provides an image, carefully describe what you can see and explain it like a tutor.` +
      ` If text is visible in the image, read it and explain it step-by-step.` +
      ` If the image is unclear, say what is uncertain and ask for a clearer image.` +
      ` Be explicit about what evidence you used from the conversation, and if evidence is thin, say that clearly instead of claiming no memory.` +
      ` Be warm, patient, and encouraging.` +
      (lessonTitle ? ` Current lesson progress summary from this lesson thread: ${lessonProgressSummary}.` : '') +
      memoriesSection +
      understandingSection +
      lessonContextSection;

    // ── Assemble messages array ────────────────────────────────────────────
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...recentHistory,
      { role: 'user', content: message }
    ];

    const rawReply = await this.llm.query(messages, {
      imageBase64: uniqueImages[0]?.base64,
      imageBase64List: uniqueImages.map((img) => img.base64),
    });
    const reply = addContextualEmojis(rawReply);

    const assistantTurn: ChatTurn = {
      role: 'assistant',
      content: reply,
      ts: new Date().toISOString(),
    };
    this.appendCacheTurn(studentId, convId, assistantTurn);

    const snapshotTurns = await this.loadSnapshotHistory(studentId, convId);
    const baseTurns: ChatTurn[] = snapshotTurns.length
      ? snapshotTurns
      : recentHistory.map((m) => ({
          role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
          content: m.content,
          ts: new Date().toISOString(),
        }));
    const persistedTurns: ChatTurn[] = [...baseTurns, userTurn, assistantTurn].slice(-60);
    await this.persistSnapshotHistory(studentId, convId, persistedTurns);

    // Persist AI reply
    try {
      await this.db.client.from('messages').insert([{
        student_id: studentId,
        role: 'ai',
        message: reply,
        message_metadata: this.buildMessageMetadata(assistantTurn),
        conversation_id: convId,
        embedding: await this.embeddings.embed(reply)
      }]);
    } catch (e) { /* ignore */ }

    if (lessonId) {
      await this.upsertLessonMasteryRecord({
        studentId,
        lessonId,
        conversationId: convId,
        understandingSignals,
        recentHistory: [...recentHistory, { role: 'user', content: message }, { role: 'assistant', content: reply }],
      });
    }

    const followups = this.buildFollowups(message, lessonTitle || '', lessonSubject || '');
    return {
      reply,
      followups,
      conversationId: convId
    };
  }

  private buildFollowups(message: string, lessonLabel?: string, subjectLabel?: string): string[] {
    const text = (message || '').toLowerCase();
    if (lessonLabel) {
      return [
        `What should I cover next in ${lessonLabel}?`,
        `Ask me one easy check question from ${lessonLabel}`,
        `Revise the last part of ${lessonLabel} in simple words`,
      ];
    }
    if (subjectLabel) {
      return [
        `Teach one core topic of ${subjectLabel} from basics`,
        `Give me one real-life example from ${subjectLabel}`,
        `Ask me one easy ${subjectLabel} quiz question`,
      ];
    }
    if (text.includes('fraction')) return ['Can you show a pizza example?', 'Give me 3 practice questions', 'Explain like I am 10'];
    if (text.includes('algebra')) return ['Start with one easy equation', 'How to isolate x?', 'Give a word problem'];
    return ['Give me a quick summary', 'Ask me a quiz question', 'What should I learn next?'];
  }

  private parseConversationScope(studentId: string, conversationId: string) {
    const raw = String(conversationId || '').trim();
    const prefix = `conv-${studentId}:subject-`;
    if (!raw.startsWith(prefix)) {
      return {
        scopeType: 'legacy' as const,
        subjectKey: '',
        lessonId: '',
      };
    }

    const tail = raw.slice(prefix.length);
    const parts = tail.split(':');
    const subjectKey = String(parts[0] || '').trim();
    const scopePart = String(parts[1] || '').trim();

    if (scopePart === 'all-lessons') {
      return {
        scopeType: 'subject' as const,
        subjectKey,
        lessonId: '',
      };
    }

    if (scopePart.startsWith('lesson-')) {
      return {
        scopeType: 'lesson' as const,
        subjectKey,
        lessonId: scopePart.slice('lesson-'.length),
      };
    }

    return {
      scopeType: 'legacy' as const,
      subjectKey,
      lessonId: '',
    };
  }

  private toSubjectLabel(subjectKey: string) {
    const key = String(subjectKey || '').trim();
    if (!key) return 'General';
    return key
      .split('-')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private buildLessonMasteryRecord(params: {
    studentId: string;
    lessonId: string;
    teacherId?: string;
    conversationId: string;
    understandingSignals: UnderstandingSignal[];
    messageCount: number;
    firstMessageAt?: string | null;
    lastMessageAt?: string | null;
  }) {
    const subtopics = toLessonMasterySubtopics(params.understandingSignals);
    const strengths = subtopics.filter((item) => item.confidence === 'strong').map((item) => item.name);
    const needsSupport = subtopics.filter((item) => item.confidence !== 'strong').map((item) => item.name);
    const nextSubtopic = subtopics.find((item) => item.status === 'next')?.name
      || subtopics.find((item) => item.status === 'needs_practice')?.name
      || subtopics[0]?.name
      || null;
    const overallConfidence = subtopics.some((item) => item.confidence === 'needs-support')
      ? 'needs-support'
      : subtopics.some((item) => item.confidence === 'building')
        ? 'building'
        : 'strong';
    const status = overallConfidence === 'strong' ? 'completed' : 'in_progress';
    const masterySummary = subtopics
      .map((item) => `${item.name}: ${item.confidence.replace(/-/g, ' ')}`)
      .join('; ')
      .slice(0, 500);
    const nowIso = new Date().toISOString();

    return {
      student_id: params.studentId,
      lesson_id: params.lessonId,
      teacher_id: params.teacherId || null,
      status,
      messages_count: params.messageCount,
      first_message_at: params.firstMessageAt || nowIso,
      last_message_at: params.lastMessageAt || nowIso,
      completed_at: status === 'completed' ? (params.lastMessageAt || nowIso) : null,
      overall_confidence: overallConfidence,
      mastery_summary: masterySummary || null,
      next_recommended_subtopic: nextSubtopic,
      strengths,
      needs_support: needsSupport,
      subtopics,
      source_conversation_id: params.conversationId,
      last_mastery_update_at: params.lastMessageAt || nowIso,
      updated_at: nowIso,
    };
  }

  private async upsertLessonMasteryRecord(params: {
    studentId: string;
    lessonId: string;
    conversationId: string;
    understandingSignals: UnderstandingSignal[];
    recentHistory: Array<{ role: string; content: string }>;
  }) {
    if (!params.lessonId) return;

    try {
      const lessonRes = await this.db.client
        .from('lessons')
        .select('id,teacher_id')
        .eq('id', params.lessonId)
        .limit(1);
      const lessonRow = Array.isArray((lessonRes as any)?.data) ? (lessonRes as any).data[0] : null;

      const threadMessagesRes = await this.db.client
        .from('messages')
        .select('role,created_at,message')
        .eq('student_id', params.studentId)
        .eq('conversation_id', params.conversationId)
        .order('created_at', { ascending: true })
        .limit(200);
      const threadMessages = Array.isArray((threadMessagesRes as any)?.data) ? (threadMessagesRes as any).data : [];
      const firstMessageAt = threadMessages[0]?.created_at || new Date().toISOString();
      const lastMessageAt = threadMessages[threadMessages.length - 1]?.created_at || new Date().toISOString();
      const messageCount = threadMessages.length || params.recentHistory.length;

      const payload = this.buildLessonMasteryRecord({
        studentId: params.studentId,
        lessonId: params.lessonId,
        teacherId: String(lessonRow?.teacher_id || '').trim() || undefined,
        conversationId: params.conversationId,
        understandingSignals: params.understandingSignals,
        messageCount,
        firstMessageAt,
        lastMessageAt,
      });

      const existingRes = await this.db.client
        .from('student_lesson_progress')
        .select('id,first_message_at')
        .eq('student_id', params.studentId)
        .eq('lesson_id', params.lessonId)
        .limit(1);
      const existingRow = Array.isArray((existingRes as any)?.data) ? (existingRes as any).data[0] : null;

      if (existingRow?.id) {
        await this.db.client
          .from('student_lesson_progress')
          .update({
            ...payload,
            first_message_at: existingRow.first_message_at || payload.first_message_at,
          })
          .eq('id', existingRow.id);
        return;
      }

      await this.db.client
        .from('student_lesson_progress')
        .insert([payload]);
    } catch (e) {
      console.warn('student lesson mastery upsert failed', e?.message || e);
    }
  }

  async getLearningTimeline(studentId: string, opts?: { limit?: number }) {
    const requestedLimit = Number(opts?.limit || 20);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(100, Math.floor(requestedLimit)))
      : 20;

    const res = await this.db.client
      .from('messages')
      .select('id,role,message,created_at,conversation_id')
      .eq('student_id', studentId)
      .order('created_at', { ascending: true })
      .limit(2000);

    const rows = Array.isArray((res as any)?.data) ? (res as any).data : [];
    const byConversation = new Map<string, any[]>();

    rows.forEach((row: any) => {
      const conversationId = String(row?.conversation_id || `conv-${studentId}`).trim() || `conv-${studentId}`;
      const existing = byConversation.get(conversationId) || [];
      existing.push(row);
      byConversation.set(conversationId, existing);
    });

    const lessonIds = Array.from(new Set(
      Array.from(byConversation.keys())
        .map((cid) => this.parseConversationScope(studentId, cid).lessonId)
        .filter(Boolean)
    ));

    const lessonTitleById = new Map<string, { title: string; subject: string }>();
    const lessonMasteryByLessonId = new Map<string, any>();
    if (lessonIds.length) {
      try {
        const lessonsRes = await this.db.client
          .from('lessons')
          .select('id,title,subject')
          .in('id', lessonIds);
        const lessons = Array.isArray((lessonsRes as any)?.data) ? (lessonsRes as any).data : [];
        lessons.forEach((lesson: any) => {
          const id = String(lesson?.id || '').trim();
          if (!id) return;
          lessonTitleById.set(id, {
            title: String(lesson?.title || 'Untitled lesson').trim() || 'Untitled lesson',
            subject: String(lesson?.subject || '').trim(),
          });
        });
      } catch {
        // Best-effort enrichment only.
      }

      try {
        const masteryRes = await this.db.client
          .from('student_lesson_progress')
          .select('lesson_id,overall_confidence,mastery_summary,next_recommended_subtopic,strengths,needs_support,subtopics,last_mastery_update_at,status,messages_count')
          .eq('student_id', studentId)
          .in('lesson_id', lessonIds);
        const masteryRows = Array.isArray((masteryRes as any)?.data) ? (masteryRes as any).data : [];
        masteryRows.forEach((row: any) => {
          const lessonKey = String(row?.lesson_id || '').trim();
          if (!lessonKey) return;
          lessonMasteryByLessonId.set(lessonKey, row);
        });
      } catch {
        // Best-effort enrichment only.
      }
    }

    const timeline = Array.from(byConversation.entries())
      .map(([conversationId, messages]) => {
        const scope = this.parseConversationScope(studentId, conversationId);
        const sorted = Array.isArray(messages)
          ? messages.slice().sort((a: any, b: any) => String(a?.created_at || '').localeCompare(String(b?.created_at || '')))
          : [];
        const userMessages = sorted.filter((m: any) => m?.role !== 'ai');
        const aiMessages = sorted.filter((m: any) => m?.role === 'ai');
        const last = sorted[sorted.length - 1] || null;
        const first = sorted[0] || null;
        const lastUser = userMessages[userMessages.length - 1] || null;
        const lastAi = aiMessages[aiMessages.length - 1] || null;

        const lessonMeta = scope.lessonId ? lessonTitleById.get(scope.lessonId) : null;
        const masteryRow = scope.lessonId ? lessonMasteryByLessonId.get(scope.lessonId) : null;
        const subjectLabel = lessonMeta?.subject || this.toSubjectLabel(scope.subjectKey);
        const lessonLabel = lessonMeta?.title || (scope.lessonId ? `Lesson ${scope.lessonId}` : '');

        const userHistoryForSignals = userMessages
          .map((m: any) => ({ role: 'user', content: String(m?.message || '') }))
          .filter((m: any) => m.content);
        const understandingSignals = extractChapterSignals(userHistoryForSignals as Array<{ role: string; content: string }>);

        const developingCount = understandingSignals.filter((s) => s.understandingLevel === 'developing').length;
        const highCount = understandingSignals.filter((s) => s.understandingLevel === 'high').length;
        const confidence = String(masteryRow?.overall_confidence || '').trim() || (developingCount > 0 ? 'needs-support' : (highCount > 0 ? 'strong' : 'building'));
        const followups = this.buildFollowups(String(lastUser?.message || ''), lessonLabel, subjectLabel);

        return {
          conversationId,
          scopeType: scope.scopeType,
          subject: subjectLabel,
          lessonId: scope.lessonId || null,
          lessonTitle: lessonLabel || null,
          messageCount: sorted.length,
          userMessageCount: userMessages.length,
          aiMessageCount: aiMessages.length,
          startedAt: first?.created_at || null,
          lastActivityAt: last?.created_at || null,
          lastStudentMessage: String(lastUser?.message || '').slice(0, 240),
          lastAiMessage: String(lastAi?.message || '').slice(0, 240),
          confidence,
          masterySummary: String(masteryRow?.mastery_summary || '').trim(),
          nextRecommendedSubtopic: String(masteryRow?.next_recommended_subtopic || '').trim(),
          strengths: Array.isArray(masteryRow?.strengths) ? masteryRow.strengths : [],
          needsSupport: Array.isArray(masteryRow?.needs_support) ? masteryRow.needs_support : [],
          subtopics: Array.isArray(masteryRow?.subtopics) ? masteryRow.subtopics : [],
          masteryStatus: String(masteryRow?.status || '').trim() || null,
          understandingSignals,
          suggestedFollowups: followups,
        };
      })
      .sort((a: any, b: any) => String(b?.lastActivityAt || '').localeCompare(String(a?.lastActivityAt || '')))
      .slice(0, limit);

    const totals = {
      totalThreads: timeline.length,
      lessonThreads: timeline.filter((item: any) => item.scopeType === 'lesson').length,
      subjectThreads: timeline.filter((item: any) => item.scopeType === 'subject').length,
      legacyThreads: timeline.filter((item: any) => item.scopeType === 'legacy').length,
      totalMessages: timeline.reduce((sum: number, item: any) => sum + Number(item?.messageCount || 0), 0),
    };

    return { timeline, totals };
  }

  async getLessonMastery(studentId: string, lessonId?: string) {
    try {
      let query = this.db.client
        .from('student_lesson_progress')
        .select('student_id,lesson_id,status,messages_count,first_message_at,last_message_at,completed_at,overall_confidence,mastery_summary,next_recommended_subtopic,strengths,needs_support,subtopics,source_conversation_id,last_mastery_update_at,updated_at')
        .eq('student_id', studentId)
        .order('last_mastery_update_at', { ascending: false });

      if (lessonId) {
        query = query.eq('lesson_id', lessonId);
      }

      const res = await query;
      return Array.isArray((res as any)?.data) ? (res as any).data : [];
    } catch (e) {
      console.warn('getLessonMastery failed', e?.message || e);
      return [];
    }
  }

  async translateForReadAloud(text: string, targetLanguage?: string) {
    const sourceText = String(text || '').trim();
    if (!sourceText) return '';

    const target = String(targetLanguage || 'en-US').trim();
    if (!target || /^en(-|_|$)/i.test(target)) {
      return sourceText;
    }

    const languageMap: Record<string, string> = {
      'te': 'Telugu',
      'te-in': 'Telugu',
      'hi': 'Hindi',
      'hi-in': 'Hindi',
      'ta': 'Tamil',
      'ta-in': 'Tamil',
      'kn': 'Kannada',
      'kn-in': 'Kannada',
    };
    const normalized = target.toLowerCase();
    const languageName = languageMap[normalized] || languageMap[normalized.split('-')[0]] || target;

    try {
      const messages = [
        {
          role: 'system',
          content: `You are a translation assistant for school students. Translate the text into ${languageName}. Keep the meaning simple and clear. Return only translated text without markdown, labels, bullet prefixes, or explanation.`
        },
        {
          role: 'user',
          content: sourceText
        }
      ];
      const translated = await this.llm.query(messages as Array<{ role: string; content: string }>);
      const clean = String(translated || '').trim().replace(/^"|"$/g, '');
      return clean || sourceText;
    } catch (e) {
      console.warn('translateForReadAloud failed', e?.message || e);
      return sourceText;
    }
  }

  async generateLocalTtsAudio(text: string, targetLanguage?: string, voice?: string, speed?: number) {
    const sourceText = String(text || '').trim();
    if (!sourceText) return null;

    const serviceBase = String(process.env.TTS_SERVICE_URL || 'http://localhost:5005').trim();
    const servicePath = String(process.env.TTS_SERVICE_PATH || '/tts').trim() || '/tts';
    const serviceUrl = `${serviceBase.replace(/\/$/, '')}${servicePath.startsWith('/') ? servicePath : `/${servicePath}`}`;
    const target = String(targetLanguage || 'en-US').trim() || 'en-US';
    const preferredVoice = String(voice || process.env.TTS_SERVICE_VOICE || '').trim();

    // Keep request payload bounded to avoid oversized TTS calls.
    const boundedSource = sourceText.slice(0, 2200);
    const spokenText = /^en(-|_|$)/i.test(target)
      ? boundedSource
      : await this.translateForReadAloud(boundedSource, target);

    try {
      const res = await fetch(serviceUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: spokenText,
          language: target,
          voice: preferredVoice || undefined,
          speed: Number.isFinite(Number(speed)) ? Number(speed) : 1,
          format: 'mp3',
        })
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.warn('generateLocalTtsAudio failed', res.status, errText || 'unknown error');
        return null;
      }

      const contentType = String(res.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('audio/')) {
        const audioBuffer = Buffer.from(await res.arrayBuffer());
        if (!audioBuffer.length) return null;
        return {
          audioBase64: audioBuffer.toString('base64'),
          mimeType: contentType.split(';')[0] || 'audio/mpeg',
          provider: 'local-tts',
          voice: preferredVoice || null,
          text: spokenText,
          targetLanguage: target,
        };
      }

      const json: any = await res.json().catch(() => null);
      const audioBase64 = String(
        json?.audioBase64
        || json?.audio_base64
        || json?.data
        || ''
      ).trim();
      if (!audioBase64) return null;

      const mimeType = String(json?.mimeType || json?.mime_type || 'audio/mpeg').trim() || 'audio/mpeg';
      return {
        audioBase64,
        mimeType,
        provider: 'local-tts',
        voice: preferredVoice || String(json?.voice || '').trim() || null,
        text: spokenText,
        targetLanguage: target,
      };
    } catch (e) {
      console.warn('generateLocalTtsAudio error', e?.message || e);
      return null;
    }
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

      if (filtered.length > 0) {
        return filtered.map((r: any) => {
          const meta = this.readMessageMetadata(r);
          return {
            id: r.id,
            role: r.role || 'user',
            text: r.message || '',
            ts: r.created_at || new Date().toISOString(),
            imageDataUrl: meta.imageDataUrl,
            imageName: meta.imageName,
            imageDataUrls: meta.imageDataUrls,
            imageNames: meta.imageNames,
          };
        });
      }

      const snap = await this.loadSnapshotHistory(studentId, convId);
      if (snap.length) {
        return snap.map((m, idx) => ({
          id: `snapshot-${idx}-${m.ts}`,
          role: m.role === 'assistant' ? 'ai' : 'user',
          text: m.content,
          ts: m.ts,
          imageDataUrl: m.imageDataUrl || '',
          imageName: m.imageName || '',
          imageDataUrls: Array.isArray(m.imageDataUrls) ? m.imageDataUrls : [],
          imageNames: Array.isArray(m.imageNames) ? m.imageNames : [],
        }));
      }

      if (filtered.length === 0) {
        const cached = this.getCacheHistory(studentId, convId);
        if (cached.length) {
          return cached.map((m, idx) => ({
            id: `cache-${idx}-${m.ts}`,
            role: m.role === 'assistant' ? 'ai' : 'user',
            text: m.content,
            ts: m.ts,
            imageDataUrl: m.imageDataUrl || '',
            imageName: m.imageName || '',
            imageDataUrls: Array.isArray(m.imageDataUrls) ? m.imageDataUrls : [],
            imageNames: Array.isArray(m.imageNames) ? m.imageNames : [],
          }));
        }
      }

    } catch (e) {
      const snap = await this.loadSnapshotHistory(studentId, convId);
      if (snap.length) {
        return snap.map((m, idx) => ({
          id: `snapshot-${idx}-${m.ts}`,
          role: m.role === 'assistant' ? 'ai' : 'user',
          text: m.content,
          ts: m.ts,
          imageDataUrl: m.imageDataUrl || '',
          imageName: m.imageName || '',
          imageDataUrls: Array.isArray(m.imageDataUrls) ? m.imageDataUrls : [],
          imageNames: Array.isArray(m.imageNames) ? m.imageNames : [],
        }));
      }

      const cached = this.getCacheHistory(studentId, convId);
      return cached.map((m, idx) => ({
        id: `cache-${idx}-${m.ts}`,
        role: m.role === 'assistant' ? 'ai' : 'user',
        text: m.content,
        ts: m.ts,
        imageDataUrl: m.imageDataUrl || '',
        imageName: m.imageName || '',
        imageDataUrls: Array.isArray(m.imageDataUrls) ? m.imageDataUrls : [],
        imageNames: Array.isArray(m.imageNames) ? m.imageNames : [],
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
