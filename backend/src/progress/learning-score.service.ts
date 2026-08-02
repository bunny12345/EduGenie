import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { OrchardService } from '../orchard/orchard.service';
import { SUBJECT_BY_KEY, normalizeSubjectKey } from '../orchard/orchard.constants';

/**
 * LearningScoreService — turns a student's raw activity across the whole portal
 * (tests, homework, flashcards/games, orchard growth, AI-tutor chats, rewards,
 * streaks) into a single, easy-to-read "Learning Score" out of 1000 plus nine
 * sub-dimensions, a month-by-month growth trend, per-subject breakdowns, and a
 * plain-language alert when a student's momentum is slipping.
 *
 * Everything is computed live from real rows, so a brand-new student starts at
 * zero and the score climbs automatically as they use the portal — no seeding
 * and no snapshot table required.
 */

// Relative weight of each dimension in the /1000 headline score (sums to 1).
const DIMENSION_WEIGHTS: Record<string, number> = {
  understanding: 0.16,
  tests: 0.14,
  homework: 0.13,
  consistency: 0.12,
  revision: 0.11,
  focus: 0.10,
  confidence: 0.09,
  curiosity: 0.08,
  speaking: 0.07,
};

const DIMENSION_LABELS: Record<string, string> = {
  understanding: 'Understanding',
  tests: 'Tests',
  homework: 'Homework',
  consistency: 'Consistency',
  revision: 'Revision',
  focus: 'Focus',
  confidence: 'Confidence',
  curiosity: 'Curiosity',
  speaking: 'Speaking',
};

// Actionable coaching per weak dimension — shown in the "how to improve" list.
const DIMENSION_TIPS: Record<string, string> = {
  understanding: 'Revisit chapter lessons and ask the AI Tutor to explain the tricky parts in simpler words.',
  tests: 'Attempt a mock test this week and review every wrong answer to close the gaps.',
  homework: 'Finish pending homework on time — completing tasks steadily lifts this the fastest.',
  consistency: 'Study a little every day. Even 15 focused minutes keeps your streak and score climbing.',
  revision: 'Play a flashcard round daily so due cards resurface and stick in long-term memory.',
  focus: 'Do one distraction-free study block and finish the whole set before switching tasks.',
  confidence: 'Practise easier questions first to build momentum, then step up the difficulty.',
  curiosity: 'Explore a new chapter or ask the AI Tutor a "why does this work?" question.',
  speaking: 'Use the AI Tutor to explain a concept out loud in your own words.',
};

// Reasonable "full marks" targets used to normalise raw counts into 0..100.
const TARGETS = {
  messagesAllTime: 40,
  reviewsAllTime: 120,
  minutesAllTime: 600,
  coinsAllTime: 500,
  streakDays: 21,
  chapters: 12,
  activityPerMonth: 30,
};

type Dims = Record<string, number>;

@Injectable()
export class LearningScoreService {
  constructor(
    private readonly db: SupabaseService,
    private readonly orchard: OrchardService,
  ) {}

  // ── small helpers ──────────────────────────────────────────────────────────
  private async rows(table: string, studentId: string): Promise<any[]> {
    try {
      const res: any = await this.db.client.from(table).select('*').eq('student_id', studentId).limit(3000);
      if (res && res.error) return [];
      return (res && res.data) || [];
    } catch {
      return [];
    }
  }

  // The student's own account row (keyed by `id`, not `student_id`) — used to
  // find the real account-creation date so the graph starts the day they joined.
  private async studentRecord(studentId: string): Promise<any | null> {
    try {
      const res: any = await this.db.client.from('students').select('id,created_at').eq('id', studentId).limit(1);
      if (res && res.error) return null;
      return (res && res.data && res.data[0]) || null;
    } catch {
      return null;
    }
  }

  // Earliest timestamp across all of a student's activity (fallback start date).
  private earliestEventMs(ctx: any): number {
    const times: number[] = [];
    for (const r of ctx.attempts || []) times.push(LearningScoreService.ts(r.submitted_at, r.created_at));
    for (const r of ctx.hwAttempts || []) times.push(LearningScoreService.ts(r.submitted_at, r.created_at));
    for (const r of ctx.sessions || []) times.push(LearningScoreService.ts(r.ended_at, r.created_at));
    for (const r of ctx.fcProgress || []) times.push(LearningScoreService.ts(r.created_at, r.updated_at));
    for (const r of ctx.msgs || []) times.push(LearningScoreService.ts(r.created_at));
    for (const r of ctx.rewards || []) times.push(LearningScoreService.ts(r.created_at, r.awarded_at));
    for (const r of ctx.activity || []) times.push(LearningScoreService.ts(r.occurred_at, r.created_at));
    const valid = times.filter((t) => t > 0);
    return valid.length ? Math.min(...valid) : 0;
  }

  private static clamp(n: number): number {
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }

  private static avg(nums: number[]): number | null {
    const arr = (nums || []).filter((n) => Number.isFinite(n));
    if (!arr.length) return null;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  private static ts(...vals: any[]): number {
    for (const v of vals) {
      if (!v) continue;
      const t = new Date(v).getTime();
      if (Number.isFinite(t)) return t;
    }
    return 0;
  }

  private static monthKey(t: number): string {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  // The end of the academic year for a given start date: the first 30 April
  // that falls on or after the account-creation date. (School years here run to
  // the end of April, so the graph always finishes at April.)
  private static academicEndMs(createdAtMs: number): number {
    const created = new Date(createdAtMs || Date.now());
    const endYear = created.getMonth() <= 3 ? created.getFullYear() : created.getFullYear() + 1;
    return new Date(endYear, 3, 30, 23, 59, 59, 999).getTime(); // 30 April
  }

  // Build month buckets from the month the account was created through to the
  // end of the academic year (April) — so the graph shows the whole road ahead:
  // real progress up to now, then the remaining months to April as the "goal".
  private static monthBuckets(createdAtMs: number): Array<{ key: string; label: string; end: number; future: boolean }> {
    const nowMs = Date.now();
    const created = new Date(createdAtMs || nowMs);
    const endApril = LearningScoreService.academicEndMs(createdAtMs);
    const out: Array<{ key: string; label: string; end: number; future: boolean }> = [];
    const cursor = new Date(created.getFullYear(), created.getMonth(), 1);
    let guard = 0;
    while (cursor.getTime() <= endApril && guard < 24) {
      const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
      out.push({
        key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
        label: cursor.toLocaleString('en-US', { month: 'short' }),
        end,
        // A month counts as "future" only once its first day is still ahead of
        // today — so the current month always shows real, up-to-date progress.
        future: cursor.getTime() > nowMs,
      });
      cursor.setMonth(cursor.getMonth() + 1);
      guard++;
    }
    return out;
  }

  // Build day buckets from the day the account was created up to today
  // (oldest → newest), capped at `maxCount` days. A brand-new student only sees
  // the days since they joined — no empty "phantom" days beforehand.
  private static dayBuckets(createdAtMs: number, maxCount = 14): Array<{ key: string; label: string; weekday: string; end: number }> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const created = new Date(createdAtMs || now.getTime());
    const createdStart = new Date(created.getFullYear(), created.getMonth(), created.getDate()).getTime();
    const daysSince = Math.floor((todayStart - createdStart) / 86400000);
    const count = Math.max(1, Math.min(maxCount, daysSince + 1));
    const out: Array<{ key: string; label: string; weekday: string; end: number }> = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
      out.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        label: String(d.getDate()),
        weekday: d.toLocaleString('en-US', { weekday: 'short' }),
        end,
      });
    }
    return out;
  }

  // ── the core: compute the 9 dimensions for data on/before `asOf` (or all-time) ──
  private computeDimensions(ctx: any, asOf: number | null): { dims: Dims; overall: number; eventCount: number } {
    const within = (t: number) => asOf === null || (t > 0 && t <= asOf);

    const attempts = ctx.attempts.filter((r: any) => within(LearningScoreService.ts(r.submitted_at, r.created_at)));
    const hw = ctx.hwAttempts.filter((r: any) => within(LearningScoreService.ts(r.submitted_at, r.created_at)));
    const sessions = ctx.sessions.filter((r: any) => within(LearningScoreService.ts(r.ended_at, r.created_at)));
    const fc = ctx.fcProgress.filter((r: any) => within(LearningScoreService.ts(r.last_reviewed_at, r.updated_at, r.created_at)));
    const msgs = ctx.msgs.filter((r: any) => within(LearningScoreService.ts(r.created_at)));
    const rewards = ctx.rewards.filter((r: any) => within(LearningScoreService.ts(r.created_at, r.awarded_at)));
    const activity = ctx.activity.filter((r: any) => within(LearningScoreService.ts(r.occurred_at, r.created_at)));

    // Timestamped event volume — used both for effort signals and to ramp in the
    // orchard's current-state meters historically (so the trend grows smoothly).
    const eventCount = attempts.length + hw.length + sessions.length + msgs.length + rewards.length + activity.length;
    const ramp = asOf === null ? 1 : Math.min(1, eventCount / Math.max(1, ctx.totalEventCount));

    // Tests: average percentage across graded attempts.
    const testPct = LearningScoreService.avg(
      attempts.map((a: any) => {
        const max = Number(a.max_score || a.total || 0);
        const sc = Number(a.score || 0);
        if (max > 0) return (sc / max) * 100;
        return Number.isFinite(sc) ? LearningScoreService.clamp(sc) : NaN;
      }),
    );

    // Game/flashcard accuracy across sessions.
    const gameAcc = LearningScoreService.avg(
      sessions.map((s: any) => {
        const total = Number(s.total || 0);
        return total > 0 ? (Number(s.score || 0) / total) * 100 : NaN;
      }),
    );

    // Flashcard mastery from the Leitner boxes / correctness ledger.
    let fcCorrectPct: number | null = null;
    let boxPct: number | null = null;
    let reviewVol = 0;
    if (fc.length) {
      const totReview = fc.reduce((s: number, r: any) => s + Number(r.review_count || 0), 0);
      const totCorrect = fc.reduce((s: number, r: any) => s + Number(r.correct_count || 0), 0);
      fcCorrectPct = totReview > 0 ? (totCorrect / totReview) * 100 : null;
      boxPct = (LearningScoreService.avg(fc.map((r: any) => Number(r.box || 0))) || 0) / 5 * 100;
      reviewVol = totReview;
    }

    // Homework: completion volume blended with graded score.
    const hwScore = LearningScoreService.avg(hw.map((h: any) => LearningScoreService.clamp(Number(h.score || 0))));
    const hwVol = Math.min(100, (hw.length / 8) * 100);

    // Orchard current-state meters (ramped in over time for the historical trend).
    const treeAvg = (field: string) =>
      (LearningScoreService.avg((ctx.trees || []).map((t: any) => Number(t[field] || 0))) || 0) * ramp;
    const rootsAvg = (LearningScoreService.avg((ctx.growth || []).map((g: any) => Number(g.roots_pct || 0))) || 0) * ramp;
    const sunlightAvg = treeAvg('sunlight_pct');

    // Engagement counts.
    const userMsgs = msgs.filter((m: any) => String(m.role || '').toLowerCase() !== 'ai' && String(m.role || '').toLowerCase() !== 'assistant').length;
    const distinctChapters = new Set(
      [...sessions, ...activity, ...ctx.growth]
        .map((r: any) => r.chapter_id)
        .filter(Boolean)
        .map(String),
    ).size;
    const minutes =
      ctx.pmetrics
        .filter((r: any) => within(LearningScoreService.ts(r.date, r.created_at, r.recorded_at)))
        .reduce((s: number, r: any) => s + Number(r.minutes || r.time_spent || 0), 0) +
      sessions.reduce((s: number, r: any) => s + Number(r.duration_ms || 0) / 60000, 0);
    const coins = rewards
      .filter((r: any) => String(r.reward_type || 'coin') === 'coin')
      .reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

    // Consistency: active-day cadence + orchard day streak.
    const activeDays = new Set(
      [...attempts.map((a: any) => LearningScoreService.ts(a.submitted_at, a.created_at)),
       ...hw.map((h: any) => LearningScoreService.ts(h.submitted_at, h.created_at)),
       ...sessions.map((s: any) => LearningScoreService.ts(s.ended_at, s.created_at)),
       ...activity.map((r: any) => LearningScoreService.ts(r.occurred_at, r.created_at)),
       ...msgs.map((m: any) => LearningScoreService.ts(m.created_at))]
        .filter((t) => t > 0)
        .map((t) => new Date(t).toISOString().slice(0, 10)),
    ).size;
    const dayStreak = Number((ctx.profile && ctx.profile.day_streak) || 0) * (asOf === null ? 1 : ramp);

    // ── assemble the nine dimensions (each 0..100) ───────────────────────────
    const understanding = LearningScoreService.clamp(
      0.5 * rootsAvg + 0.3 * (testPct ?? 0) + 0.2 * (fcCorrectPct ?? gameAcc ?? 0),
    );
    const tests = LearningScoreService.clamp(testPct ?? 0);
    const homework = LearningScoreService.clamp(hw.length ? 0.6 * (hwScore ?? 0) + 0.4 * hwVol : 0);
    const revision = LearningScoreService.clamp(
      fc.length || sessions.length
        ? 0.4 * (fcCorrectPct ?? gameAcc ?? 0) + 0.3 * (boxPct ?? 0) + 0.3 * Math.min(100, (reviewVol / TARGETS.reviewsAllTime) * 100)
        : 0,
    );
    const focus = LearningScoreService.clamp(
      0.6 * Math.min(100, (minutes / TARGETS.minutesAllTime) * 100) + 0.4 * (gameAcc ?? testPct ?? 0),
    );
    const confidence = LearningScoreService.clamp(
      0.5 * sunlightAvg + 0.3 * (testPct ?? 0) + 0.2 * Math.min(100, (coins / TARGETS.coinsAllTime) * 100),
    );
    const curiosity = LearningScoreService.clamp(
      0.5 * Math.min(100, (userMsgs / TARGETS.messagesAllTime) * 100) + 0.5 * Math.min(100, (distinctChapters / TARGETS.chapters) * 100),
    );
    const speaking = LearningScoreService.clamp(Math.min(100, (userMsgs / TARGETS.messagesAllTime) * 100));
    const consistency = LearningScoreService.clamp(
      0.5 * Math.min(100, (dayStreak / TARGETS.streakDays) * 100) + 0.5 * Math.min(100, (activeDays / 20) * 100),
    );

    const dims: Dims = { understanding, tests, homework, consistency, revision, focus, confidence, curiosity, speaking };
    let overall = 0;
    for (const [k, w] of Object.entries(DIMENSION_WEIGHTS)) overall += (dims[k] || 0) * w;
    return { dims, overall: LearningScoreService.clamp(overall), eventCount };
  }

  private static grade(score1000: number): { label: string; tier: string; color: string } {
    if (score1000 >= 850) return { label: 'Excellent', tier: 'excellent', color: '#16a34a' };
    if (score1000 >= 750) return { label: 'Strong', tier: 'strong', color: '#0d9488' };
    if (score1000 >= 650) return { label: 'Good', tier: 'good', color: '#2563eb' };
    if (score1000 >= 500) return { label: 'Developing', tier: 'developing', color: '#d97706' };
    if (score1000 >= 300) return { label: 'Getting started', tier: 'starting', color: '#ea580c' };
    if (score1000 > 0) return { label: 'Just beginning', tier: 'beginning', color: '#dc2626' };
    return { label: 'Not started yet', tier: 'none', color: '#94a3b8' };
  }

  // ── public entry point ─────────────────────────────────────────────────────
  async getLearningScore(studentId: string): Promise<any> {
    const [attempts, hwAttempts, fcProgress, sessions, profileRows, trees, growth, rewards, msgs, pmetrics, activity, subjectKeys, studentRow] =
      await Promise.all([
        this.rows('test_attempts', studentId),
        this.rows('homework_attempts', studentId),
        this.rows('flashcard_progress', studentId),
        this.rows('game_sessions', studentId),
        this.rows('orchard_profile', studentId),
        this.rows('orchard_trees', studentId),
        this.rows('chapter_growth', studentId),
        this.rows('student_rewards', studentId),
        this.rows('messages', studentId),
        this.rows('progress_metrics', studentId),
        this.rows('orchard_activity', studentId),
        this.orchard.resolveStudentSubjectKeys(studentId).catch(() => ['mathematics', 'science', 'social']),
        this.studentRecord(studentId),
      ]);

    const totalEventCount =
      attempts.length + hwAttempts.length + sessions.length + msgs.length + rewards.length + activity.length;

    const ctx: any = {
      attempts, hwAttempts, fcProgress, sessions,
      profile: (profileRows && profileRows[0]) || null,
      trees, growth, rewards, msgs, pmetrics, activity, totalEventCount,
    };

    // When did this account start? Prefer the real account-creation date so the
    // graph begins the day the student joined — never earlier. Fall back to the
    // orchard profile, then the earliest activity, then now.
    const accountCreatedMs = LearningScoreService.ts(
      studentRow && studentRow.created_at,
      ctx.profile && ctx.profile.created_at,
    ) || this.earliestEventMs(ctx) || Date.now();

    // Current snapshot (all-time).
    const current = this.computeDimensions(ctx, null);
    const score1000 = Math.round(current.overall * 10);
    const grade = LearningScoreService.grade(score1000);
    const hasData = totalEventCount > 0 || fcProgress.length > 0;

    // Dimension list for the UI (sorted by weight desc for a stable order).
    const dimensions = Object.keys(DIMENSION_WEIGHTS).map((key) => ({
      key,
      label: DIMENSION_LABELS[key],
      value: Math.round(current.dims[key] || 0),
      weight: DIMENSION_WEIGHTS[key],
    }));

    // Monthly growth trend — cumulative composite so the curve rises as the
    // student learns and the final point equals the current score. Runs from the
    // account-creation month all the way to the end of the academic year (April);
    // months still in the future carry a null score (drawn as the "road ahead").
    const buckets = LearningScoreService.monthBuckets(accountCreatedMs);
    const trend = buckets.map((b) => {
      if (b.future) return { key: b.key, label: b.label, score: null, value: null, future: true };
      const snap = this.computeDimensions(ctx, b.end);
      return { key: b.key, label: b.label, score: Math.round(snap.overall * 10), value: Math.round(snap.overall), future: false };
    });

    // Daily growth trend — from the day the account was created (capped at 14
    // days), so students can watch their score climb day by day.
    const dayBk = LearningScoreService.dayBuckets(accountCreatedMs);
    const dailyTrend = dayBk.map((b) => {
      const snap = this.computeDimensions(ctx, b.end);
      return { key: b.key, label: b.label, weekday: b.weekday, score: Math.round(snap.overall * 10), value: Math.round(snap.overall) };
    });

    // Recent momentum (last 30 vs previous 30 days) → honest decline detection
    // even while the cumulative curve keeps rising.
    const now = Date.now();
    const DAY = 86400000;
    const recentCtx = this.windowCtx(ctx, now - 30 * DAY, now);
    const priorCtx = this.windowCtx(ctx, now - 60 * DAY, now - 30 * DAY);
    const recent = this.computeDimensions(recentCtx, null);
    const prior = this.computeDimensions(priorCtx, null);

    const droppedDimensions = Object.keys(DIMENSION_WEIGHTS)
      .map((k) => ({ key: k, label: DIMENSION_LABELS[k], from: Math.round(prior.dims[k] || 0), to: Math.round(recent.dims[k] || 0), delta: Math.round((recent.dims[k] || 0) - (prior.dims[k] || 0)) }))
      .filter((d) => d.delta <= -4)
      .sort((a, b) => a.delta - b.delta)
      .slice(0, 3);

    const momentumDelta = Math.round((recent.overall - prior.overall) * 10);
    const stoppedStudying = priorCtx.totalEventCount > 0 && recentCtx.totalEventCount === 0;

    // Per-subject breakdown.
    const subjects = subjectKeys.map((key: string) => this.subjectBreakdown(key, ctx, buckets, dayBk));

    // Weakest subject with any activity, else lowest overall (for the focus nudge).
    const rankedSubjects = subjects.filter((s: any) => s.status !== 'not-started').sort((a: any, b: any) => a.score - b.score);
    const focusSubject = rankedSubjects[0] || null;

    // Strengths & focus areas from the current dimensions.
    const dimsSorted = [...dimensions].sort((a, b) => b.value - a.value);
    const strengths = dimsSorted.filter((d) => d.value > 0).slice(0, 3);
    const focusAreas = [...dimensions].filter((d) => d.value > 0 || hasData).sort((a, b) => a.value - b.value).slice(0, 3);

    // Build the alert (declining / stalled / encouragement).
    const alert = this.buildAlert({
      hasData, momentumDelta, stoppedStudying, droppedDimensions, focusSubject, focusAreas, score1000,
    });

    // "How to improve" — actionable tips from the weakest dimensions + subject.
    const improvements: string[] = [];
    for (const d of focusAreas) {
      if (DIMENSION_TIPS[d.key] && d.value < 80) improvements.push(DIMENSION_TIPS[d.key]);
    }
    if (focusSubject && focusSubject.score < 70) {
      improvements.unshift(`Spend extra time on ${focusSubject.name} — it's currently your lowest subject at ${focusSubject.score}%.`);
    }

    return {
      success: true,
      hasData,
      score: score1000,
      maxScore: 1000,
      grade: grade.label,
      tier: grade.tier,
      color: grade.color,
      momentumDelta,
      dimensions,
      trend,
      dailyTrend,
      subjects,
      strengths,
      focusAreas,
      improvements: improvements.slice(0, 4),
      alert,
      accountCreatedAt: new Date(accountCreatedMs).toISOString(),
      trackingSince: new Date(accountCreatedMs).toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      academicEndAt: new Date(LearningScoreService.academicEndMs(accountCreatedMs)).toISOString(),
      academicEndLabel: new Date(LearningScoreService.academicEndMs(accountCreatedMs)).toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      generatedAt: new Date().toISOString(),
    };
  }

  // Slice the context down to events inside [from, to) for momentum comparisons.
  private windowCtx(ctx: any, from: number, to: number): any {
    const inWin = (t: number) => t >= from && t < to;
    const attempts = ctx.attempts.filter((r: any) => inWin(LearningScoreService.ts(r.submitted_at, r.created_at)));
    const hwAttempts = ctx.hwAttempts.filter((r: any) => inWin(LearningScoreService.ts(r.submitted_at, r.created_at)));
    const sessions = ctx.sessions.filter((r: any) => inWin(LearningScoreService.ts(r.ended_at, r.created_at)));
    const fcProgress = ctx.fcProgress.filter((r: any) => inWin(LearningScoreService.ts(r.last_reviewed_at, r.updated_at, r.created_at)));
    const msgs = ctx.msgs.filter((r: any) => inWin(LearningScoreService.ts(r.created_at)));
    const rewards = ctx.rewards.filter((r: any) => inWin(LearningScoreService.ts(r.created_at, r.awarded_at)));
    const activity = ctx.activity.filter((r: any) => inWin(LearningScoreService.ts(r.occurred_at, r.created_at)));
    const pmetrics = ctx.pmetrics.filter((r: any) => inWin(LearningScoreService.ts(r.date, r.created_at, r.recorded_at)));
    const totalEventCount = attempts.length + hwAttempts.length + sessions.length + msgs.length + rewards.length + activity.length;
    return {
      ...ctx, attempts, hwAttempts, sessions, fcProgress, msgs, rewards, activity, pmetrics, totalEventCount,
    };
  }

  private subjectBreakdown(key: string, ctx: any, buckets: Array<{ key: string; label: string; end: number; future?: boolean }>, dayBuckets: Array<{ key: string; label: string; weekday?: string; end: number; future?: boolean }>): any {
    const meta = SUBJECT_BY_KEY[key] || { display_name: key, accent_color: '#6d5efc', tree_emoji: '🌱' };
    const sTests = ctx.attempts.filter((a: any) => normalizeSubjectKey(a.subject) === key);
    const sSessions = ctx.sessions.filter((s: any) => String(s.subject_key || '') === key);
    const sFc = ctx.fcProgress.filter((r: any) => String(r.subject_key || '') === key);
    const tree = (ctx.trees || []).find((t: any) => String(t.subject_key || '') === key) || null;
    const sGrowth = (ctx.growth || []).filter((g: any) => String(g.subject_key || '') === key);

    const testPct = LearningScoreService.avg(
      sTests.map((a: any) => {
        const max = Number(a.max_score || a.total || 0);
        return max > 0 ? (Number(a.score || 0) / max) * 100 : NaN;
      }),
    );
    const gameAcc = LearningScoreService.avg(
      sSessions.map((s: any) => {
        const total = Number(s.total || 0);
        return total > 0 ? (Number(s.score || 0) / total) * 100 : NaN;
      }),
    );
    const totReview = sFc.reduce((s: number, r: any) => s + Number(r.review_count || 0), 0);
    const totCorrect = sFc.reduce((s: number, r: any) => s + Number(r.correct_count || 0), 0);
    const fcAcc = totReview > 0 ? (totCorrect / totReview) * 100 : null;
    const treeProg = tree ? Number(tree.progress_pct || 0) : null;
    const rootsAvg = LearningScoreService.avg(sGrowth.map((g: any) => Number(g.roots_pct || 0)));

    const parts: Array<[number, number]> = [];
    if (treeProg !== null) parts.push([treeProg, 0.35]);
    if (rootsAvg !== null) parts.push([rootsAvg, 0.2]);
    if (testPct !== null) parts.push([testPct, 0.25]);
    if (gameAcc !== null || fcAcc !== null) parts.push([(gameAcc ?? fcAcc) as number, 0.2]);

    const hasAny = sTests.length + sSessions.length > 0
      || totReview > 0
      || (treeProg !== null && treeProg > 0)
      || (rootsAvg !== null && rootsAvg > 0);
    let score = 0;
    if (parts.length) {
      const wsum = parts.reduce((s, [, w]) => s + w, 0);
      score = LearningScoreService.clamp(parts.reduce((s, [v, w]) => s + v * w, 0) / (wsum || 1));
    }
    score = Math.round(score);

    // Cumulative curve for this subject over any set of time buckets (reused
    // for both the monthly and the day-by-day views). Future months (past today)
    // carry a null value so the chart can draw them as the road still ahead.
    const curveFor = (bucketList: Array<{ key: string; label: string; weekday?: string; end: number; future?: boolean }>) =>
      bucketList.map((b) => {
        if (b.future) return { key: b.key, label: b.label, weekday: b.weekday, value: null, future: true };
        const t = sTests.filter((a: any) => LearningScoreService.ts(a.submitted_at, a.created_at) <= b.end);
        const g = sSessions.filter((s: any) => LearningScoreService.ts(s.ended_at, s.created_at) <= b.end);
        const eventsUpTo = t.length + g.length;
        const ramp = Math.min(1, eventsUpTo / Math.max(1, sTests.length + sSessions.length));
        const tp = LearningScoreService.avg(t.map((a: any) => { const max = Number(a.max_score || a.total || 0); return max > 0 ? (Number(a.score || 0) / max) * 100 : NaN; }));
        const ga = LearningScoreService.avg(g.map((s: any) => { const total = Number(s.total || 0); return total > 0 ? (Number(s.score || 0) / total) * 100 : NaN; }));
        const p: Array<[number, number]> = [];
        if (treeProg !== null) p.push([treeProg * ramp, 0.35]);
        if (rootsAvg !== null) p.push([rootsAvg * ramp, 0.2]);
        if (tp !== null) p.push([tp, 0.25]);
        if (ga !== null) p.push([ga, 0.2]);
        let v = 0;
        if (p.length) { const ws = p.reduce((s, [, w]) => s + w, 0); v = p.reduce((s, [val, w]) => s + val * w, 0) / (ws || 1); }
        return { key: b.key, label: b.label, weekday: b.weekday, value: Math.round(LearningScoreService.clamp(v)), future: false };
      });
    const trend = curveFor(buckets);
    const daily = curveFor(dayBuckets);

    // Recent vs prior subject momentum.
    const now = Date.now();
    const DAY = 86400000;
    const perfIn = (from: number, to: number) => {
      const t = sTests.filter((a: any) => { const x = LearningScoreService.ts(a.submitted_at, a.created_at); return x >= from && x < to; });
      const g = sSessions.filter((s: any) => { const x = LearningScoreService.ts(s.ended_at, s.created_at); return x >= from && x < to; });
      const tp = LearningScoreService.avg(t.map((a: any) => { const max = Number(a.max_score || a.total || 0); return max > 0 ? (Number(a.score || 0) / max) * 100 : NaN; }));
      const ga = LearningScoreService.avg(g.map((s: any) => { const total = Number(s.total || 0); return total > 0 ? (Number(s.score || 0) / total) * 100 : NaN; }));
      return LearningScoreService.avg([tp, ga].filter((n): n is number => n !== null));
    };
    const rec = perfIn(now - 30 * DAY, now);
    const pri = perfIn(now - 60 * DAY, now - 30 * DAY);
    const subjTrend = rec !== null && pri !== null ? Math.round(rec - pri) : 0;

    const status = !hasAny ? 'not-started' : score >= 75 ? 'strong' : score >= 50 ? 'on-track' : 'needs-focus';
    let tip = '';
    if (status === 'not-started') tip = `Start a ${meta.display_name} chapter or flashcard round to grow this subject.`;
    else if (status === 'needs-focus') tip = `Focus here: revise ${meta.display_name} lessons and attempt a short quiz to lift your score.`;
    else if (status === 'on-track') tip = `Good progress — keep practising ${meta.display_name} to reach mastery.`;
    else tip = `Excellent command of ${meta.display_name}. Keep it up!`;

    // ── Subject-specific "skills" (the same idea as the overall 9, but scoped
    // to just this subject) so the detail window mirrors the main report. ──────
    const practiceAcc = gameAcc ?? fcAcc;
    const metrics = [
      { key: 'understanding', emoji: '🧠', label: 'Understanding', value: Math.round(LearningScoreService.clamp(rootsAvg ?? 0)), desc: 'How deeply you get this subject' },
      { key: 'tests', emoji: '📝', label: 'Test Scores', value: Math.round(LearningScoreService.clamp(testPct ?? 0)), desc: 'How you did on quizzes & tests' },
      { key: 'practice', emoji: '🔁', label: 'Practice', value: Math.round(LearningScoreService.clamp(practiceAcc ?? 0)), desc: 'How accurate your practice is' },
      { key: 'growth', emoji: '🌳', label: 'Tree Growth', value: Math.round(LearningScoreService.clamp(treeProg ?? 0)), desc: 'How much your subject tree has grown' },
    ];

    // Friendly raw counts for the detail window.
    const cardsReviewed = totReview;
    const distinctChapters = new Set(
      [...sTests, ...sSessions, ...sGrowth].map((r: any) => r.chapter_id).filter(Boolean).map(String),
    ).size;
    const bestTest = sTests.length
      ? Math.round(Math.max(...sTests.map((a: any) => { const max = Number(a.max_score || a.total || 0); return max > 0 ? (Number(a.score || 0) / max) * 100 : 0; })))
      : 0;
    const stats = [
      { key: 'tests', emoji: '📝', label: 'Tests taken', value: sTests.length },
      { key: 'rounds', emoji: '🎮', label: 'Practice rounds', value: sSessions.length },
      { key: 'cards', emoji: '🃏', label: 'Cards reviewed', value: cardsReviewed },
      { key: 'chapters', emoji: '📖', label: 'Chapters touched', value: distinctChapters },
    ];

    // Strengths & focus within this subject (only when there's real activity).
    const rankedMetrics = metrics.filter((m) => hasAny);
    const subjStrength = hasAny ? [...rankedMetrics].sort((a, b) => b.value - a.value)[0] : null;
    const subjFocus = hasAny ? [...rankedMetrics].sort((a, b) => a.value - b.value)[0] : null;

    return {
      subjectKey: key,
      name: meta.display_name,
      accent: meta.accent_color,
      emoji: (meta as any).tree_emoji || '🌱',
      score,
      score1000: score * 10,
      trend: subjTrend,
      status,
      statusLabel: status === 'strong' ? 'Great!' : status === 'on-track' ? 'On track' : status === 'needs-focus' ? 'Needs work' : 'Not started',
      tip,
      monthly: trend,
      daily,
      metrics,
      stats,
      bestTest,
      strength: subjStrength ? { emoji: subjStrength.emoji, label: subjStrength.label, value: subjStrength.value } : null,
      focus: subjFocus ? { emoji: subjFocus.emoji, label: subjFocus.label, value: subjFocus.value } : null,
    };
  }

  private buildAlert(input: any): any {
    const { hasData, momentumDelta, stoppedStudying, droppedDimensions, focusSubject, focusAreas, score1000 } = input;
    if (!hasData) {
      return {
        level: 'info',
        title: 'Let’s build your Learning Score',
        message: 'Start studying, play a flashcard round, finish homework or take a quiz — your score will grow automatically and appear right here.',
        dropped: [],
      };
    }
    if (stoppedStudying) {
      return {
        level: 'alert',
        title: 'Your progress is slipping',
        message: `You haven't studied in the last few weeks and your momentum has dropped. Jump back in${focusSubject ? ` with ${focusSubject.name}` : ''} to get your score climbing again.`,
        dropped: droppedDimensions,
      };
    }
    if (momentumDelta <= -20 || droppedDimensions.length >= 2) {
      const names = droppedDimensions.slice(0, 2).map((d: any) => d.label).join(' and ');
      return {
        level: 'alert',
        title: 'Your progress is going down',
        message: `Your ${names || 'recent performance'} dropped this month${focusSubject ? `, and ${focusSubject.name} needs the most attention` : ''}. Follow the steps below to bounce back.`,
        dropped: droppedDimensions,
      };
    }
    if (momentumDelta < 0 || droppedDimensions.length === 1) {
      const d = droppedDimensions[0];
      return {
        level: 'warn',
        title: 'Slight dip — easy to fix',
        message: `Your ${d ? d.label.toLowerCase() : 'momentum'} eased off a little recently. A short study session will get you back on track.`,
        dropped: droppedDimensions,
      };
    }
    return {
      level: 'good',
      title: score1000 >= 750 ? 'You’re on a great streak!' : 'You’re moving in the right direction',
      message: momentumDelta > 0 ? `Nice work — your score is up ${momentumDelta} points recently. Keep the momentum going!` : 'Steady progress. Keep studying a little every day to climb faster.',
      dropped: [],
    };
  }
}
