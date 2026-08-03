import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { LlmService } from '../llm/llm.service';
import { OrchardService } from '../orchard/orchard.service';
import { LocalFeedService } from '../shared/local-feed.service';
import { normalizeSubjectKey, subjectEntryFor } from '../orchard/orchard.constants';
import {
  GAME_CATALOG,
  GameCatalogEntry,
  ReviewRating,
  deckKey as buildDeckKey,
  nextSrsState,
  scheduleLabel,
} from './games.constants';

const MAX_CONTENT_CHARS = 6000;   // cap LLM input per chapter → save tokens
const DEFAULT_CARDS_PER_CHAPTER = 10;
const MIN_CARDS_PER_CHAPTER = 6;
const MAX_CARDS_PER_CHAPTER = 30;
const WORDS_PER_CARD = 120;       // ~1 card per 120 words of lesson content
const DEFAULT_SESSION_LIMIT = 20;

// Rank used to order cards from easy → hard, both when generating and studying.
const DIFFICULTY_RANK: Record<string, number> = { easy: 0, medium: 1, hard: 2 };

// Coins granted the first time a student clears every card in a chapter.
const CHAPTER_COMPLETION_COINS = 100;

interface GenerateOptions {
  count?: number;
  force?: boolean; // regenerate even if the deck already has cards
}

@Injectable()
export class FlashcardsService {
  constructor(
    private readonly db: SupabaseService,
    private readonly llm: LlmService,
    private readonly orchard: OrchardService,
    private readonly localFeed: LocalFeedService,
  ) {}

  // ─── low-level DB helpers (work in both real Supabase and mock modes) ──────
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

  // ─── arcade catalog ─────────────────────────────────────────────────────────
  listGames(): GameCatalogEntry[] {
    return [...GAME_CATALOG].sort((a, b) => a.order - b.order);
  }

  private subjectMeta(subjectKey: string) {
    const s = subjectEntryFor(subjectKey);
    return {
      displayName: s.display_name,
      accent: s.accent_color,
      treeEmoji: s.tree_emoji,
      fruitEmoji: s.fruit_emoji,
    };
  }

  // ─── deck lifecycle ──────────────────────────────────────────────────────────
  private async findDeckByKey(key: string): Promise<any | null> {
    const rows = await this.selectRows('flashcard_decks', [['deck_key', key]]);
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
    return this.insertRow('flashcard_decks', {
      deck_key: key,
      subject_key: params.subjectKey,
      class_name: params.className || null,
      chapter_id: params.chapterId || null,
      lesson_id: params.lessonId || null,
      chapter_number: params.chapterNumber || 1,
      chapter_title: params.chapterTitle,
      source: params.source || 'ai',
      card_count: 0,
      generated_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  // Scale the number of cards to the lesson size so big chapters get more
  // cards and tiny ones don't get padded with filler (~1 card / 120 words).
  private computeCardCount(content: string): number {
    const words = String(content || '').trim().split(/\s+/).filter(Boolean).length;
    const scaled = Math.round(words / WORDS_PER_CARD);
    return Math.max(MIN_CARDS_PER_CHAPTER, Math.min(MAX_CARDS_PER_CHAPTER, scaled || DEFAULT_CARDS_PER_CHAPTER));
  }

  // ─── LLM generation (runs at most ONCE per chapter → tokens saved) ───────────
  private async generateCardsWithLlm(
    content: string,
    chapterTitle: string,
    subjectDisplay: string,
    count: number,
  ): Promise<Array<{ front: string; back: string; hint?: string; difficulty?: string }>> {
    const trimmed = String(content || '').slice(0, MAX_CONTENT_CHARS);
    if (!trimmed.trim()) return [];
    const prompt = [
      {
        role: 'system',
        content:
          'You are an expert teacher creating study flashcards for school students. ' +
          'Return ONLY a compact JSON array, no prose, no markdown fences.',
      },
      {
        role: 'user',
        content:
          `Subject: ${subjectDisplay}\nChapter: ${chapterTitle}\n\n` +
          `Create ${count} high-quality flashcards from the material below. ` +
          `Each card must be a JSON object with keys: "front" (a clear question, max 120 chars), ` +
          `"back" (a concise correct answer, max 240 chars), "hint" (a short optional nudge), ` +
          `and "difficulty" (one of "easy","medium","hard"). ` +
          `Start with a few "easy" recall cards, then "medium", then a few "hard" application cards ` +
          `so the deck ramps up in difficulty. Cover the most important, testable ideas. Avoid duplicates.\n\n` +
          `Return a JSON array of exactly ${count} such objects.\n\nMATERIAL:\n${trimmed}`,
      },
    ];
    let raw = '';
    try {
      raw = await this.llm.query(prompt);
    } catch {
      return [];
    }
    return this.parseCardsJson(raw);
  }

  private parseCardsJson(raw: string): Array<{ front: string; back: string; hint?: string; difficulty?: string }> {
    if (!raw) return [];
    let text = String(raw).trim();
    // Strip code fences if the model added them.
    text = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();

    let arr: any[] | null = null;
    // 1) Happy path: parse the outermost JSON array.
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
    // 2) Recovery: small models often truncate before the closing "]" or emit
    //    one object per line. Grab every top-level {...} block and parse each.
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

    const out: Array<{ front: string; back: string; hint?: string; difficulty?: string }> = [];
    const seen = new Set<string>();
    for (const c of arr) {
      const front = String(c?.front || c?.question || '').trim();
      const back = String(c?.back || c?.answer || '').trim();
      if (!front || !back) continue;
      const dedupe = front.toLowerCase();
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      const difficulty = ['easy', 'medium', 'hard'].includes(String(c?.difficulty || '').toLowerCase())
        ? String(c.difficulty).toLowerCase()
        : 'medium';
      out.push({
        front: front.slice(0, 240),
        back: back.slice(0, 500),
        hint: c?.hint ? String(c.hint).slice(0, 200) : undefined,
        difficulty,
      });
    }
    // Order easy → medium → hard so a chapter always ramps up in difficulty.
    out.sort((a, b) => (DIFFICULTY_RANK[a.difficulty || 'medium'] ?? 1) - (DIFFICULTY_RANK[b.difficulty || 'medium'] ?? 1));
    return out;
  }

  private async insertCards(
    deck: any,
    cards: Array<{ front: string; back: string; hint?: string; difficulty?: string }>,
    source: string,
  ): Promise<number> {
    let order = 0;
    for (const c of cards) {
      order += 1;
      await this.insertRow('flashcards', {
        deck_id: deck.id,
        subject_key: deck.subject_key,
        class_name: deck.class_name || null,
        chapter_id: deck.chapter_id || null,
        chapter_number: deck.chapter_number || 1,
        chapter_title: deck.chapter_title,
        front: c.front,
        back: c.back,
        hint: c.hint || null,
        difficulty: c.difficulty || 'medium',
        order_index: order,
        source,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    await this.updateRows(
      'flashcard_decks',
      { card_count: cards.length, generated_at: new Date().toISOString(), source },
      [['id', deck.id]],
    );
    return cards.length;
  }

  /**
   * Auto-generate a chapter's flashcards from an uploaded lesson's content.
   * Called (fire-and-forget) after a lesson document finishes extraction, so
   * cards are ready before the student ever opens the game — no live AI wait.
   * Idempotent: if the deck already has cards, it does nothing (saves tokens).
   */
  async generateForLesson(lessonId: string, opts: GenerateOptions = {}): Promise<{ success: boolean; deckId?: string; cards?: number; skipped?: boolean; reason?: string }> {
    const lessonRows = await this.selectRows('lessons', [['id', lessonId]]);
    const lesson = lessonRows && lessonRows[0];
    if (!lesson) return { success: false, reason: 'lesson-not-found' };
    const subjectKey = normalizeSubjectKey(lesson.subject);
    if (!subjectKey) return { success: false, reason: 'unknown-subject' };

    const chapterTitle = String(lesson.title || 'Chapter').trim();
    const deck = await this.ensureDeck({
      subjectKey,
      className: lesson.class_name || null,
      chapterTitle,
      chapterNumber: Number(lesson.order_index || 1),
      lessonId: lesson.id,
      source: 'ai',
    });

    if (!opts.force && Number(deck.card_count || 0) > 0) {
      return { success: true, deckId: deck.id, skipped: true, reason: 'already-generated' };
    }

    const chunks = await this.selectRows('lesson_chunks', [['lesson_id', lessonId]]);
    const content = (chunks || [])
      .sort((a, b) => Number(a.chunk_index || 0) - Number(b.chunk_index || 0))
      .map((c) => String(c.chunk_text || ''))
      .join('\n');
    if (!content.trim()) return { success: false, deckId: deck.id, reason: 'no-content' };

    const meta = this.subjectMeta(subjectKey);
    const count = opts.count || this.computeCardCount(content);
    const cards = await this.generateCardsWithLlm(content, chapterTitle, meta.displayName, count);
    if (!cards.length) return { success: false, deckId: deck.id, reason: 'generation-empty' };

    const inserted = await this.insertCards(deck, cards, 'ai');
    return { success: true, deckId: deck.id, cards: inserted };
  }

  // ─── subject + chapter picker data ───────────────────────────────────────────
  async getFlashcardOverview(studentId: string): Promise<any> {
    const subjectKeys = await this.orchard.resolveStudentSubjectKeys(studentId);
    const now = Date.now();
    const subjects: any[] = [];

    for (const subjectKey of subjectKeys) {
      const decks = await this.selectRows('flashcard_decks', [['subject_key', subjectKey]]);
      const meta = this.subjectMeta(subjectKey);
      if (!decks || !decks.length) {
        // Subject the student takes but no chapters uploaded yet → still list it
        // so it's discoverable; cards appear automatically once the teacher
        // uploads chapter content (same flow as Mathematics).
        subjects.push({
          subjectKey,
          displayName: meta.displayName,
          accent: meta.accent,
          treeEmoji: meta.treeEmoji,
          fruitEmoji: meta.fruitEmoji,
          chapters: [],
          totalCards: 0,
          dueCount: 0,
          empty: true,
        });
        continue;
      }
      const cards = await this.selectRows('flashcards', [['subject_key', subjectKey]]);
      const progress = await this.selectRows('flashcard_progress', [
        ['student_id', studentId],
        ['subject_key', subjectKey],
      ]);
      const progByCard = new Map((progress || []).map((p) => [String(p.flashcard_id), p]));
      const cardsByDeck = new Map<string, any[]>();
      for (const c of cards || []) {
        const k = String(c.deck_id);
        if (!cardsByDeck.has(k)) cardsByDeck.set(k, []);
        cardsByDeck.get(k)!.push(c);
      }

      const isDue = (card: any) => {
        const p = progByCard.get(String(card.id));
        if (!p) return true; // never seen = due
        return new Date(p.due_at || 0).getTime() <= now;
      };

      const chapters = (decks || [])
        .map((d) => {
          const deckCards = cardsByDeck.get(String(d.id)) || [];
          const dueCount = deckCards.filter(isDue).length;
          const newCount = deckCards.filter((c) => !progByCard.has(String(c.id))).length;
          return {
            deckId: d.id,
            chapterId: d.chapter_id || null,
            chapterNumber: Number(d.chapter_number || 0),
            title: d.chapter_title,
            cardCount: deckCards.length,
            dueCount,
            newCount,
          };
        })
        .filter((c) => c.cardCount > 0)
        .sort((a, b) => a.chapterNumber - b.chapterNumber || a.title.localeCompare(b.title));

      subjects.push({
        subjectKey,
        displayName: meta.displayName,
        accent: meta.accent,
        treeEmoji: meta.treeEmoji,
        fruitEmoji: meta.fruitEmoji,
        chapters,
        totalCards: chapters.reduce((s, c) => s + c.cardCount, 0),
        dueCount: chapters.reduce((s, c) => s + c.dueCount, 0),
        empty: chapters.length === 0,
      });
    }

    return { success: true, subjects };
  }

  // ─── build a study session of cards ──────────────────────────────────────────
  async getCards(
    studentId: string,
    params: { subjectKey: string; deckId?: string; scope?: string; mode?: string; limit?: number },
  ): Promise<any> {
    const subjectKey = params.subjectKey;
    if (!subjectKey) return { success: false, error: 'subject required' };
    const mode = params.mode === 'all' ? 'all' : 'review';
    const limit = Math.max(1, Math.min(60, Number(params.limit || DEFAULT_SESSION_LIMIT)));
    const now = Date.now();

    // Resolve the card pool: one chapter (deckId) or all chapters for the subject.
    let cards: any[] = [];
    if (params.deckId && params.scope !== 'all') {
      cards = await this.selectRows('flashcards', [['deck_id', params.deckId]]);
    } else {
      cards = await this.selectRows('flashcards', [['subject_key', subjectKey]]);
    }
    if (!cards || !cards.length) return { success: true, cards: [], mode, scope: params.scope || 'all' };

    const progress = await this.selectRows('flashcard_progress', [
      ['student_id', studentId],
      ['subject_key', subjectKey],
    ]);
    const progByCard = new Map((progress || []).map((p) => [String(p.flashcard_id), p]));

    const enriched = cards.map((c) => {
      const p = progByCard.get(String(c.id));
      const dueAt = p ? new Date(p.due_at || 0).getTime() : 0;
      return {
        flashcardId: c.id,
        deckId: c.deck_id,
        chapterId: c.chapter_id || null,
        chapterTitle: c.chapter_title,
        front: c.front,
        back: c.back,
        hint: c.hint || null,
        difficulty: c.difficulty || 'medium',
        box: p ? Number(p.box || 0) : 0,
        isNew: !p,
        reviewCount: p ? Number(p.review_count || 0) : 0,
        _rank: DIFFICULTY_RANK[String(c.difficulty || 'medium').toLowerCase()] ?? 1,
        _order: Number(c.order_index || 0),
        _dueMs: p ? dueAt : 0,
        _isDue: p ? dueAt <= now : true,
      };
    });

    // Cards within a chapter always play easy → medium → hard (then by author order).
    const byDifficulty = (a: any, b: any) => a._rank - b._rank || a._order - b._order;

    let pool: any[];
    const singleDeck = Boolean(params.deckId && params.scope !== 'all');
    if (mode === 'all' || singleDeck) {
      // Practising a chapter (or "practice all"): ramp up easy → hard.
      pool = [...enriched].sort(byDifficulty);
    } else {
      // Review mode across chapters: due + new first (soonest due first), each
      // group ordered easy → hard, then top up with the rest.
      const due = enriched.filter((c) => c._isDue).sort((a, b) => a._dueMs - b._dueMs || byDifficulty(a, b));
      const rest = enriched.filter((c) => !c._isDue).sort(byDifficulty);
      pool = [...due, ...rest];
    }

    const session = pool.slice(0, limit).map(({ _dueMs, _isDue, _rank, _order, ...card }) => card);
    return { success: true, mode, scope: params.deckId && params.scope !== 'all' ? params.deckId : 'all', cards: session };
  }

  // ─── record a single card review → advance spaced repetition ─────────────────
  async submitReview(
    studentId: string,
    body: { flashcardId: string; rating: ReviewRating },
  ): Promise<any> {
    const rating: ReviewRating = ['again', 'good', 'easy'].includes(body.rating) ? body.rating : 'good';
    const cardRows = await this.selectRows('flashcards', [['id', body.flashcardId]]);
    const card = cardRows && cardRows[0];
    if (!card) return { success: false, error: 'card not found' };

    const existingRows = await this.selectRows('flashcard_progress', [
      ['student_id', studentId],
      ['flashcard_id', body.flashcardId],
    ]);
    const existing = existingRows && existingRows[0];
    const currentBox = existing ? Number(existing.box || 0) : 0;
    const next = nextSrsState(currentBox, rating);
    const gotIt = rating !== 'again';
    const streak = gotIt ? (existing ? Number(existing.streak || 0) : 0) + 1 : 0;

    const changes = {
      box: next.box,
      interval_days: next.intervalDays,
      due_at: next.dueAt,
      last_reviewed_at: new Date().toISOString(),
      review_count: (existing ? Number(existing.review_count || 0) : 0) + 1,
      correct_count: (existing ? Number(existing.correct_count || 0) : 0) + (gotIt ? 1 : 0),
      streak,
    };

    if (existing) {
      await this.updateRows('flashcard_progress', changes, [['id', existing.id]]);
    } else {
      await this.insertRow('flashcard_progress', {
        student_id: studentId,
        flashcard_id: body.flashcardId,
        deck_id: card.deck_id || null,
        subject_key: card.subject_key,
        chapter_id: card.chapter_id || null,
        ...changes,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    return {
      success: true,
      schedule: {
        box: next.box,
        intervalDays: next.intervalDays,
        dueAt: next.dueAt,
        label: scheduleLabel(next.intervalDays),
      },
    };
  }

  // ─── log a completed game session (+ grow the orchard tree) ──────────────────
  async logSession(
    studentId: string,
    body: {
      gameKey?: string;
      subjectKey?: string;
      chapterId?: string;
      chapterScope?: string;
      score?: number;
      total?: number;
      durationMs?: number;
      meta?: any;
    },
  ): Promise<any> {
    const gameKey = body.gameKey || 'flashcards';
    const score = Math.max(0, Number(body.score || 0));
    const total = Math.max(0, Number(body.total || 0));
    const session = await this.insertRow('game_sessions', {
      student_id: studentId,
      game_key: gameKey,
      subject_key: body.subjectKey || null,
      chapter_id: body.chapterId || null,
      chapter_scope: body.chapterScope || 'all',
      score,
      total,
      duration_ms: body.durationMs != null ? Number(body.durationMs) : null,
      meta: body.meta || {},
      started_at: new Date(Date.now() - (Number(body.durationMs) || 0)).toISOString(),
      ended_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });

    // Tie games back into the living orchard: a good flashcard run waters the
    // matching subject tree (real activity → real growth).
    if (gameKey === 'flashcards' && body.subjectKey && score > 0) {
      try {
        await this.orchard.recordActivity(studentId, {
          subjectKey: body.subjectKey,
          chapterId: body.chapterId,
          activityType: 'flashcards',
          correct: score >= Math.ceil(total / 2),
        });
      } catch {
        /* orchard tie-in is best-effort */
      }
    }

    return { success: true, session };
  }

  // ─── coins: read the student's running balance ───────────────────────────────
  // Balance = sum of coin ledger rows in student_rewards (persisted in the DB, so
  // it survives backend restarts and re-logins). LocalFeedService is only a fast
  // in-memory mirror used as a fallback when the DB is unreachable.
  private async getCoinBalance(studentId: string): Promise<number> {
    try {
      const res = await this.db.client
        .from('student_rewards')
        .select('reward_type,amount')
        .eq('student_id', studentId);
      // Trust the DB whenever the query itself succeeds (even with 0 rows), so a
      // stale in-memory mirror can never mask the true persisted balance.
      if (!((res as any)?.error)) {
        const rows = ((res as any)?.data as any[]) || [];
        return rows
          .filter((r) => String(r.reward_type || 'coin') === 'coin')
          .reduce((sum, r) => sum + Number(r.amount || 0), 0);
      }
    } catch {
      /* fall back to in-memory mirror below */
    }
    try {
      return Number(this.localFeed.getRewards(studentId)?.coins || 0);
    } catch {
      return 0;
    }
  }

  // Add coins by appending a ledger row to student_rewards (persistent), and keep
  // the in-memory mirror in sync so the /rewards endpoint reads the same number.
  private async addCoins(studentId: string, coins: number, reason: string): Promise<number> {
    const amount = Math.max(0, Number(coins || 0));
    let persisted = false;
    try {
      const ins = await this.db.client
        .from('student_rewards')
        .insert([{ student_id: studentId, reward_type: 'coin', amount, label: reason, reason }])
        .select();
      persisted = !((ins as any)?.error) && Boolean((ins as any)?.data);
    } catch {
      persisted = false;
    }

    // Keep the LocalFeedService mirror consistent for the /rewards fallback path.
    this.localFeed.addReward(studentId, { amount, reason, reward_type: 'coin' });
    this.localFeed.logStudentActivity(studentId, {
      type: 'reward',
      action: 'earned',
      title: `${amount} coins earned`,
      details: reason,
      meta: { coins: amount },
    });

    // Prefer the authoritative DB balance; if the write didn't persist, use mirror.
    if (persisted) return this.getCoinBalance(studentId);
    return Number(this.localFeed.getRewards(studentId)?.coins || amount);
  }

  /**
   * Award the one-time "finished the whole chapter" coin bonus. Idempotent via
   * the flashcard_chapter_completions unique(student, deck) row — replaying a
   * chapter bumps times_completed but never pays out twice.
   */
  async completeChapter(
    studentId: string,
    body: { deckId: string; subjectKey?: string; chapterTitle?: string },
  ): Promise<any> {
    const deckId = String(body.deckId || '').trim();
    if (!deckId) return { success: false, error: 'deckId required' };

    const existingRows = await this.selectRows('flashcard_chapter_completions', [
      ['student_id', studentId],
      ['deck_id', deckId],
    ]);
    const existing = existingRows && existingRows[0];

    if (existing) {
      await this.updateRows(
        'flashcard_chapter_completions',
        { times_completed: Number(existing.times_completed || 1) + 1 },
        [['id', existing.id]],
      );
      return { success: true, awarded: 0, alreadyEarned: true, coins: await this.getCoinBalance(studentId) };
    }

    const reason = `Completed flashcards: ${body.chapterTitle || 'chapter'}`;
    await this.insertRow('flashcard_chapter_completions', {
      student_id: studentId,
      deck_id: deckId,
      subject_key: body.subjectKey || null,
      chapter_title: body.chapterTitle || null,
      coins_awarded: CHAPTER_COMPLETION_COINS,
      times_completed: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const coins = await this.addCoins(studentId, CHAPTER_COMPLETION_COINS, reason);
    return { success: true, awarded: CHAPTER_COMPLETION_COINS, alreadyEarned: false, coins };
  }
}