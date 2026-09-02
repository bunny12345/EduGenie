import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { LlmService } from '../llm/llm.service';
import { OrchardService } from '../orchard/orchard.service';
import { normalizeSubjectKey, subjectEntryFor } from '../orchard/orchard.constants';
import { deckKey as buildDeckKey } from './games.constants';

const MAX_CONTENT_CHARS = 6000;    // cap LLM input per chapter → save tokens
const DEFAULT_QUESTIONS_PER_CHAPTER = 8;
const MIN_QUESTIONS_PER_CHAPTER = 5;
const MAX_QUESTIONS_PER_CHAPTER = 20;
const WORDS_PER_QUESTION = 150;    // ~1 question per 150 words of lesson content
const DEFAULT_SESSION_LIMIT = 10;

const DIFFICULTY_RANK: Record<string, number> = { easy: 0, medium: 1, hard: 2 };

interface GenerateOptions {
  count?: number;
  force?: boolean; // regenerate even if the deck already has questions
}

/**
 * Quiz Rush (arcade) — pre-generated multiple-choice questions per chapter,
 * mirroring the flashcards content model so the game never hits the LLM live
 * during play. Auto-generated on lesson upload via CurriculumService, same as
 * flashcards. (The AI-Tutor-embedded Quiz Rush in chat.service.ts generates
 * questions on demand instead — that one stays as-is for in-conversation use.)
 */
@Injectable()
export class QuizRushService {
  constructor(
    private readonly db: SupabaseService,
    private readonly llm: LlmService,
    private readonly orchard: OrchardService,
  ) {}

  // ─── low-level DB helpers (mirrors FlashcardsService's) ─────────────────────
  private async selectRows(table: string, eqs: Array<[string, any]>): Promise<any[]> {
    try {
      let q: any = this.db.client.from(table).select('*');
      for (const [k, v] of eqs) q = q.eq(k, v);
      const res = await q;
      return (res && res.data) || [];
    } catch {
      return [];
    }
  }

  private async insertRow(table: string, row: any): Promise<any> {
    try {
      const res = await this.db.client.from(table).insert([row]).select();
      return (res && res.data && res.data[0]) || row;
    } catch {
      return row;
    }
  }

  private async updateRows(table: string, changes: any, eqs: Array<[string, any]>): Promise<void> {
    try {
      let q: any = this.db.client.from(table).update({ ...changes, updated_at: new Date().toISOString() });
      for (const [k, v] of eqs) q = q.eq(k, v);
      await q;
    } catch {
      /* non-fatal */
    }
  }

  private async deleteRows(table: string, eqs: Array<[string, any]>): Promise<void> {
    try {
      let q: any = this.db.client.from(table).delete();
      for (const [k, v] of eqs) q = q.eq(k, v);
      await q;
    } catch {
      /* non-fatal */
    }
  }

  private subjectMeta(subjectKey: string) {
    const s = subjectEntryFor(subjectKey);
    return {
      displayName: s.display_name,
      accent: s.accent_color,
      treeEmoji: s.tree_emoji,
    };
  }

  private deckMatchesClass(deck: any, className: string): boolean {
    const deckClass = String(deck?.class_name || '').trim().toLowerCase();
    if (!deckClass) return true;
    return deckClass === String(className || '').trim().toLowerCase();
  }

  private async findDeckByKey(key: string): Promise<any | null> {
    const rows = await this.selectRows('quiz_decks', [['deck_key', key]]);
    return (rows && rows[0]) || null;
  }

  private async ensureDeck(params: {
    subjectKey: string;
    className?: string | null;
    chapterTitle: string;
    chapterNumber?: number;
    chapterId?: string | null;
    lessonId?: string | null;
    source?: string;
  }): Promise<any> {
    const key = buildDeckKey(params.subjectKey, params.className, params.chapterTitle);
    const existing = await this.findDeckByKey(key);
    if (existing) return existing;
    return this.insertRow('quiz_decks', {
      deck_key: key,
      subject_key: params.subjectKey,
      class_name: params.className || null,
      chapter_id: params.chapterId || null,
      lesson_id: params.lessonId || null,
      chapter_number: params.chapterNumber || 1,
      chapter_title: params.chapterTitle,
      source: params.source || 'ai',
      question_count: 0,
      generated_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  private computeQuestionCount(content: string): number {
    const words = String(content || '').trim().split(/\s+/).filter(Boolean).length;
    const scaled = Math.round(words / WORDS_PER_QUESTION);
    return Math.max(MIN_QUESTIONS_PER_CHAPTER, Math.min(MAX_QUESTIONS_PER_CHAPTER, scaled || DEFAULT_QUESTIONS_PER_CHAPTER));
  }

  // ─── LLM generation (runs at most ONCE per chapter → tokens saved) ───────────
  private async generateQuestionsWithLlm(
    content: string,
    chapterTitle: string,
    subjectDisplay: string,
    count: number,
  ): Promise<Array<{ question: string; options: string[]; correctIndex: number; explanation?: string; difficulty?: string }>> {
    const trimmed = String(content || '').slice(0, MAX_CONTENT_CHARS);
    if (!trimmed.trim()) return [];
    const prompt = [
      {
        role: 'system',
        content:
          'You are an expert teacher creating a multiple-choice quiz for school students. ' +
          'Return ONLY a compact JSON array, no prose, no markdown fences.',
      },
      {
        role: 'user',
        content:
          `Subject: ${subjectDisplay}\nChapter: ${chapterTitle}\n\n` +
          `Create ${count} multiple-choice questions from the material below. ` +
          `Each question must be a JSON object with keys: "question" (max 200 chars), ` +
          `"options" (an array of exactly 4 short strings), "correctIndex" (0-based index into options), ` +
          `"explanation" (a short one-sentence reason, max 200 chars), ` +
          `and "difficulty" (one of "easy","medium","hard"). ` +
          `Start with a few "easy" recall questions, then "medium", then a few "hard" application questions ` +
          `so the quiz ramps up in difficulty. Cover the most important, testable ideas. Avoid duplicates.\n\n` +
          `Return a JSON array of exactly ${count} such objects.\n\nMATERIAL:\n${trimmed}`,
      },
    ];
    let raw = '';
    try {
      raw = await this.llm.query(prompt);
    } catch {
      return [];
    }
    return this.parseQuestionsJson(raw);
  }

  private parseQuestionsJson(raw: string): Array<{ question: string; options: string[]; correctIndex: number; explanation?: string; difficulty?: string }> {
    if (!raw) return [];
    let text = String(raw).trim();
    text = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();

    let arr: any[] | null = null;
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        const parsed = JSON.parse(text.slice(start, end + 1));
        if (Array.isArray(parsed)) arr = parsed;
      } catch {
        /* fall through to recovery */
      }
    }
    // Recovery: grab every top-level {...} block if the array didn't parse whole.
    if (!arr) {
      const objects: any[] = [];
      const matches = text.match(/\{[^{}]*\}/g) || [];
      for (const m of matches) {
        try {
          objects.push(JSON.parse(m));
        } catch {
          /* skip malformed fragment */
        }
      }
      if (objects.length) arr = objects;
    }
    if (!arr || !Array.isArray(arr)) return [];

    const out: Array<{ question: string; options: string[]; correctIndex: number; explanation?: string; difficulty?: string }> = [];
    const seen = new Set<string>();
    for (const q of arr) {
      const question = String(q?.question || '').trim();
      const options = Array.isArray(q?.options) ? q.options.map((o: any) => String(o).trim()).filter(Boolean) : [];
      if (!question || options.length < 2) continue;
      const dedupe = question.toLowerCase();
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      const rawIndex = Number(q?.correctIndex);
      const correctIndex = Number.isFinite(rawIndex) && rawIndex >= 0 && rawIndex < options.length ? rawIndex : 0;
      const difficulty = ['easy', 'medium', 'hard'].includes(String(q?.difficulty || '').toLowerCase())
        ? String(q.difficulty).toLowerCase()
        : 'medium';
      out.push({
        question: question.slice(0, 240),
        options: options.slice(0, 6),
        correctIndex,
        explanation: q?.explanation ? String(q.explanation).slice(0, 240) : undefined,
        difficulty,
      });
    }
    out.sort((a, b) => (DIFFICULTY_RANK[a.difficulty || 'medium'] ?? 1) - (DIFFICULTY_RANK[b.difficulty || 'medium'] ?? 1));
    return out;
  }

  private async insertQuestions(
    deck: any,
    questions: Array<{ question: string; options: string[]; correctIndex: number; explanation?: string; difficulty?: string }>,
    source: string,
  ): Promise<number> {
    let order = 0;
    for (const q of questions) {
      order += 1;
      await this.insertRow('quiz_questions', {
        deck_id: deck.id,
        subject_key: deck.subject_key,
        class_name: deck.class_name || null,
        chapter_id: deck.chapter_id || null,
        chapter_title: deck.chapter_title,
        question: q.question,
        options: q.options,
        correct_index: q.correctIndex,
        explanation: q.explanation || null,
        difficulty: q.difficulty || 'medium',
        order_index: order,
        source,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    await this.updateRows(
      'quiz_decks',
      { question_count: questions.length, generated_at: new Date().toISOString(), source },
      [['id', deck.id]],
    );
    return questions.length;
  }

  /**
   * Auto-generate a chapter's quiz questions from an uploaded lesson's content.
   * Called fire-and-forget after a lesson document finishes extraction, exactly
   * like FlashcardsService.generateForLesson — idempotent unless force=true.
   */
  async generateForLesson(lessonId: string, opts: GenerateOptions = {}): Promise<{ success: boolean; deckId?: string; questions?: number; skipped?: boolean; reason?: string }> {
    const lessonRows = await this.selectRows('lessons', [['id', lessonId]]);
    const lesson = lessonRows && lessonRows[0];
    if (!lesson) return { success: false, reason: 'lesson-not-found' };
    const subjectKey = normalizeSubjectKey(lesson.subject);
    if (!subjectKey) return { success: false, reason: 'unknown-subject' };

    const chapterTitle = String(lesson.title || 'Chapter').trim();
    let deckClassName = String(lesson.class_name || '').trim();
    if (!deckClassName) {
      const vis = await this.selectRows('lesson_class_visibility', [['lesson_id', lessonId]]);
      const firstVisible = (vis || []).find((v) => v.is_visible !== false && v.class_name);
      deckClassName = String(firstVisible?.class_name || '').trim();
    }
    const deck = await this.ensureDeck({
      subjectKey,
      className: deckClassName || null,
      chapterTitle,
      chapterNumber: Number(lesson.order_index || 1),
      lessonId: lesson.id,
      source: 'ai',
    });

    if (!opts.force && Number(deck.question_count || 0) > 0) {
      return { success: true, deckId: deck.id, skipped: true, reason: 'already-generated' };
    }
    if (opts.force && Number(deck.question_count || 0) > 0) {
      await this.deleteRows('quiz_questions', [['deck_id', deck.id]]);
    }

    const chunks = await this.selectRows('lesson_chunks', [['lesson_id', lessonId]]);
    const content = (chunks || [])
      .sort((a, b) => Number(a.chunk_index || 0) - Number(b.chunk_index || 0))
      .map((c) => String(c.chunk_text || ''))
      .join('\n');
    if (!content.trim()) return { success: false, deckId: deck.id, reason: 'no-content' };

    const meta = this.subjectMeta(subjectKey);
    const count = opts.count || this.computeQuestionCount(content);
    const questions = await this.generateQuestionsWithLlm(content, chapterTitle, meta.displayName, count);
    if (!questions.length) return { success: false, deckId: deck.id, reason: 'generation-empty' };

    const inserted = await this.insertQuestions(deck, questions, 'ai');
    return { success: true, deckId: deck.id, questions: inserted };
  }

  async generateForAllLessons(): Promise<{ generated: number; skipped: number; failed: number }> {
    let generated = 0, skipped = 0, failed = 0;
    try {
      const res = await this.db.client.from('lessons').select('id');
      const lessons = Array.isArray((res as any)?.data) ? (res as any).data : [];
      for (const lesson of lessons) {
        const result = await this.generateForLesson(String(lesson.id || ''));
        if (result.skipped) skipped++;
        else if (result.success) generated++;
        else failed++;
      }
    } catch { /* non-fatal */ }
    return { generated, skipped, failed };
  }

  // ─── subject + chapter picker data ───────────────────────────────────────────
  async getOverview(studentId: string): Promise<any> {
    const subjectKeys = await this.orchard.resolveStudentSubjectKeys(studentId);
    const className = await this.orchard.resolveStudentClassName(studentId);
    const subjects: any[] = [];

    for (const subjectKey of subjectKeys) {
      const decks = (await this.selectRows('quiz_decks', [['subject_key', subjectKey]]))
        .filter((d) => this.deckMatchesClass(d, className));
      const meta = this.subjectMeta(subjectKey);
      if (!decks || !decks.length) {
        subjects.push({
          subjectKey,
          displayName: meta.displayName,
          accent: meta.accent,
          treeEmoji: meta.treeEmoji,
          chapters: [],
          totalQuestions: 0,
          empty: true,
        });
        continue;
      }
      const questions = await this.selectRows('quiz_questions', [['subject_key', subjectKey]]);
      const questionsByDeck = new Map<string, any[]>();
      for (const q of questions || []) {
        const k = String(q.deck_id);
        if (!questionsByDeck.has(k)) questionsByDeck.set(k, []);
        questionsByDeck.get(k)!.push(q);
      }

      const chapters = (decks || [])
        .map((d) => ({
          deckId: d.id,
          chapterId: d.chapter_id || null,
          lessonId: d.lesson_id || null,
          chapterNumber: Number(d.chapter_number || 0),
          title: d.chapter_title,
          questionCount: (questionsByDeck.get(String(d.id)) || []).length,
        }))
        .filter((c) => c.questionCount > 0)
        .sort((a, b) => a.chapterNumber - b.chapterNumber || a.title.localeCompare(b.title));

      subjects.push({
        subjectKey,
        displayName: meta.displayName,
        accent: meta.accent,
        treeEmoji: meta.treeEmoji,
        chapters,
        totalQuestions: chapters.reduce((s, c) => s + c.questionCount, 0),
        empty: chapters.length === 0,
      });
    }

    return { success: true, subjects };
  }

  // ─── build a play session of questions ───────────────────────────────────────
  async getQuestions(
    studentId: string,
    params: { subjectKey: string; deckId?: string; scope?: string; limit?: number },
  ): Promise<any> {
    const subjectKey = params.subjectKey;
    if (!subjectKey) return { success: false, error: 'subject required' };
    const limit = Math.max(1, Math.min(30, Number(params.limit || DEFAULT_SESSION_LIMIT)));

    let questions: any[] = [];
    if (params.deckId && params.scope !== 'all') {
      questions = await this.selectRows('quiz_questions', [['deck_id', params.deckId]]);
    } else {
      const className = await this.orchard.resolveStudentClassName(studentId);
      const decks = (await this.selectRows('quiz_decks', [['subject_key', subjectKey]]))
        .filter((d) => this.deckMatchesClass(d, className));
      const deckIds = new Set(decks.map((d) => String(d.id)));
      const all = await this.selectRows('quiz_questions', [['subject_key', subjectKey]]);
      questions = (all || []).filter((q) => deckIds.has(String(q.deck_id)));
    }
    if (!questions || !questions.length) return { success: true, questions: [], scope: params.scope || 'all' };

    // Ramp up easy → hard, then shuffle within the picked slice so repeat plays
    // don't always show the exact same order.
    const byDifficulty = (a: any, b: any) =>
      (DIFFICULTY_RANK[String(a.difficulty || 'medium')] ?? 1) - (DIFFICULTY_RANK[String(b.difficulty || 'medium')] ?? 1)
      || Number(a.order_index || 0) - Number(b.order_index || 0);
    const pool = [...questions].sort(byDifficulty).slice(0, limit);

    const session = pool.map((q) => ({
      questionId: q.id,
      deckId: q.deck_id,
      chapterId: q.chapter_id || null,
      chapterTitle: q.chapter_title,
      question: q.question,
      options: Array.isArray(q.options) ? q.options : [],
      correctIndex: Number(q.correct_index || 0),
      explanation: q.explanation || '',
      difficulty: q.difficulty || 'medium',
    }));

    return { success: true, scope: params.deckId && params.scope !== 'all' ? params.deckId : 'all', questions: session };
  }
}
