import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { OrchardService } from '../orchard/orchard.service';
import { ACTIVITY_EFFECTS, computeStage, Milestones, normalizeSubjectKey, subjectEntryFor } from '../orchard/orchard.constants';
import { metricAt, metricMinutes, metricScore } from './progress-metric.util';
import { LocalFeedService } from '../shared/local-feed.service';

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
  private readonly logger = new Logger(LearningScoreService.name);
  private readonly pendingReports = new Map<string, Promise<any>>();
  constructor(
    private readonly db: SupabaseService,
    private readonly orchard: OrchardService,
    private readonly localFeed: LocalFeedService,
  ) {}

  // ── small helpers ──────────────────────────────────────────────────────────
  private async rows(table: string, studentId: string): Promise<any[]> {
    const rows: any[] = [];
    for (let offset = 0; ; offset += 500) {
      const res = await this.db.client.from(table).select('*').eq('student_id', studentId)
        .order('id').range(offset, offset + 499);
      if (res.error) {
        this.logger.error(`Unable to read ${table}: ${res.error.message}`);
        throw new ServiceUnavailableException('Unable to retrieve learning progress. Please try again.');
      }
      rows.push(...(res.data || []));
      if ((res.data || []).length < 500) return rows;
    }
  }

  private async assignmentRows(table: 'tests' | 'homework' | 'orchard_chapters', ids: string[], localRows: any[] = []): Promise<any[]> {
    const rows: any[] = [];
    const unique = [...new Set(ids.filter(Boolean))];
    // Local assignment IDs are valid in the mock store but not in Supabase's
    // UUID columns. Resolve these from the same feed as the assignment APIs.
    const databaseIds = this.db.client.isMock === true ? unique : unique.filter((id) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
    const localIds = new Set(unique.filter((id) => !databaseIds.includes(id)));
    rows.push(...localRows.filter((row) => localIds.has(row.id)));
    const unresolved = [...localIds].filter((id) => !rows.some((row) => row.id === id));
    if (unresolved.length) {
      this.logger.warn(`${unresolved.length} historical ${table} references have no local assignment metadata; retaining their activity without inventing a subject.`);
    }
    for (let i = 0; i < databaseIds.length; i += 100) {
      const res = await this.db.client.from(table).select(table === 'orchard_chapters' ? 'id,class_name' : 'id,subject')
        .in('id', databaseIds.slice(i, i + 100));
      if (res.error) {
        this.logger.error(`Unable to resolve ${table} subjects: ${res.error.message}`);
        throw new ServiceUnavailableException('Unable to retrieve assignment progress. Please try again.');
      }
      rows.push(...(res.data || []));
    }
    return rows;
  }

  // The student's own account row (keyed by `id`, not `student_id`) — used to
  // find the real account-creation date so the graph starts the day they joined.
  private async studentRecord(studentId: string): Promise<any | null> {
    const res = await this.db.client.from('students').select('id,created_at').eq('id', studentId).limit(1);
    if (res.error) {
      this.logger.error(`Unable to read student tracking date: ${res.error.message}`);
      throw new ServiceUnavailableException('Unable to retrieve learning progress. Please try again.');
    }
    return res.data?.[0] || null;
  }

  // Earliest timestamp across all of a student's activity (fallback start date).
  private earliestEventMs(ctx: any): number {
    const times: number[] = [];
    for (const r of ctx.attempts || []) times.push(LearningScoreService.attemptAt(r));
    for (const r of ctx.hwAttempts || []) times.push(LearningScoreService.ts(r.submitted_at, r.created_at));
    for (const r of ctx.sessions || []) times.push(LearningScoreService.ts(r.ended_at, r.created_at));
    for (const r of ctx.fcProgress || []) times.push(LearningScoreService.ts(r.created_at, r.updated_at));
    for (const r of ctx.msgs || []) times.push(LearningScoreService.ts(r.created_at));
    for (const r of ctx.rewards || []) times.push(LearningScoreService.ts(r.created_at, r.awarded_at));
    for (const r of ctx.activity || []) times.push(LearningScoreService.ts(r.occurred_at, r.created_at));
    for (const r of ctx.reviews || []) times.push(LearningScoreService.ts(r.completed_at));
    for (const r of ctx.pmetrics || []) times.push(LearningScoreService.ts(metricAt(r)));
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

  private static attemptAt(row: any): number {
    return LearningScoreService.ts(row.finished_at, row.submitted_at, row.created_at);
  }

  private static percentage(row: any): number {
    if (row.score === null || row.score === undefined || row.score === '') return NaN;
    const score = Number(row.score);
    if (!Number.isFinite(score)) return NaN;
    const max = Number(row.max_score || row.total || 0);
    return LearningScoreService.clamp(max > 0 ? score / max * 100 : score);
  }

  private static metricSource(row: any): string {
    return String(row.details?.source || row.source || row.metric_key || '').toLowerCase();
  }

  private testScore(attempts: any[], metrics: any[]): number | null {
    const legacyMetrics = metrics.filter((r) => ['test', 'mock_test'].includes(LearningScoreService.metricSource(r)))
      .filter((metric) => !attempts.some((attempt) =>
        normalizeSubjectKey(attempt.subject) === normalizeSubjectKey(metric.subject)
        && LearningScoreService.percentage(attempt) === metricScore(metric)
        && Math.abs(LearningScoreService.attemptAt(attempt) - LearningScoreService.ts(metricAt(metric))) <= 60000));
    return LearningScoreService.avg([
      ...attempts.map(LearningScoreService.percentage),
      ...legacyMetrics.map(metricScore),
    ]);
  }

  private homeworkEvidence(assignments: any[], attempts: any[], className: string): any[] {
    const assignmentById = new Map(assignments.map((r) => [String(r.id), r]));
    const evidence = attempts.filter((attempt) => {
      const assignmentClass = String(assignmentById.get(String(attempt.homework_id))?.class_name || '').trim().toLowerCase();
      return !assignmentClass || assignmentClass === className.trim().toLowerCase();
    });
    const attempted = new Set(evidence.map((r) => String(r.homework_id)));
    for (const row of assignments) {
      const status = String(row.status || '').toLowerCase();
      const assignmentClass = String(row.class_name || '').trim().toLowerCase();
      if (assignmentClass && assignmentClass !== className.trim().toLowerCase()) continue;
      if (!['submitted', 'resubmitted', 'graded'].includes(status)) continue;
      const existing = evidence.filter((attempt) => String(attempt.homework_id) === String(row.id))
        .sort((a, b) => LearningScoreService.attemptAt(b) - LearningScoreService.attemptAt(a))[0];
      const submittedAt = LearningScoreService.ts(row.submitted_at) || (existing ? LearningScoreService.attemptAt(existing) : 0);
      if (!submittedAt) {
        this.logger.warn('Submitted homework has no submission timestamp; excluding it from dated progress until its history is available.');
        continue;
      }
      const base = {
        id: `assignment-submission-${row.id}`,
        homework_id: row.id, student_id: row.student_id,
        subject: row.subject, submitted_at: new Date(submittedAt).toISOString(), score: null,
      };
      if (!attempted.has(String(row.id))) evidence.push(base);
      // Assignment grades are mutable snapshots: never apply a later grade to
      // the original submission date, or mistake an ungraded default for zero.
      if (status === 'graded' && row.grade !== null && row.grade !== undefined
        && (!existing || !Number.isFinite(LearningScoreService.percentage(existing)))) {
        const gradedAt = LearningScoreService.ts(row.graded_at, row.updated_at);
        if (gradedAt >= submittedAt) evidence.push({
          ...base, id: `assignment-grade-${row.id}`,
          submitted_at: new Date(gradedAt).toISOString(), score: row.grade,
        });
      }
    }
    return evidence;
  }

  // Replay the growth engine's recorded effects, not a fraction of today's
  // score. Mutable legacy snapshots are used only from their last update.
  private orchardSnapshot(ctx: any, asOf: number | null): { roots: number | null; growth: number | null; sunlight: number } {
    const now = ctx.now ?? Date.now();
    const cutoff = asOf ?? now;
    const chapters = ctx.growth || [];
    const states = chapters.map((chapter: any) => {
      let roots = 0;
      const milestones: Milestones = {};
      const events: Array<{ at: number; type?: string; correct?: boolean; review?: string }> = [
        ...(ctx.activity || []).filter((a: any) => a.chapter_id === chapter.chapter_id
          && normalizeSubjectKey(a.subject_key) === normalizeSubjectKey(chapter.subject_key))
          .map((a: any) => ({ at: LearningScoreService.ts(a.occurred_at, a.created_at), type: a.activity_type, correct: a.correct })),
        ...(ctx.reviews || []).filter((r: any) => r.chapter_id === chapter.chapter_id && r.passed === true && r.completed_at)
          .map((r: any) => ({ at: LearningScoreService.ts(r.completed_at), review: r.review_type })),
      ];
      for (const event of events.sort((a, b) => a.at - b.at)) {
        if (!event.at || event.at > cutoff) continue;
        const effect = event.type ? ACTIVITY_EFFECTS[event.type] : null;
        if (effect) {
          roots = LearningScoreService.clamp(roots + effect.roots + (event.correct === true ? 2 : 0));
          for (const milestone of effect.milestones) milestones[milestone] = true;
        } else if (event.review === 'week' || event.review === 'month') {
          roots = LearningScoreService.clamp(roots + (event.review === 'month' ? 8 : 4));
          milestones.week_retention = true;
          if (event.review === 'month') milestones.month_retention = true;
        }
      }
      const snapshotAt = Math.max(
        LearningScoreService.ts(chapter.stage_updated_at, chapter.updated_at) || now,
        ...events.map((e) => e.at),
      );
      const useSnapshot = snapshotAt <= cutoff;
      return {
        roots: useSnapshot ? Number(chapter.roots_pct || 0) : roots,
        stage: useSnapshot ? Number(chapter.stage_index || 0) : computeStage(milestones, roots).index,
      };
    });
    const total = Math.max(states.length, (ctx.trees || []).reduce((sum: number, t: any) => sum + Number(t.total_chapters || 0), 0));
    const sunlight = LearningScoreService.avg((ctx.trees || []).map((t: any) => {
      const activity = (ctx.activity || []).filter((a: any) =>
        normalizeSubjectKey(a.subject_key) === normalizeSubjectKey(t.subject_key)
        && LearningScoreService.ts(a.occurred_at, a.created_at) > 0
        && LearningScoreService.ts(a.occurred_at, a.created_at) <= cutoff);
      const latest = activity.reduce((max: number, a: any) =>
        Math.max(max, LearningScoreService.ts(a.occurred_at, a.created_at)), 0);
      const updated = Math.max(LearningScoreService.ts(t.last_activity_at, t.updated_at) || now, latest);
      if (updated <= cutoff) return Number(t.sunlight_pct || 0);
      const windowStart = latest - 14 * 86400000;
      return LearningScoreService.clamp(activity.filter((a: any) =>
        LearningScoreService.ts(a.occurred_at, a.created_at) >= windowStart)
        .reduce((sum: number, a: any) => sum + Number(a.sunlight || 0), 0) * 5);
    })) || 0;
    return {
      roots: total ? LearningScoreService.clamp(states.reduce((sum: number, s: { roots: number }) => sum + s.roots, 0) / total) : null,
      growth: total ? LearningScoreService.clamp(states.reduce((sum: number, s: { stage: number }) => sum + s.stage, 0) / (total * 7) * 100) : null,
      sunlight: LearningScoreService.clamp(sunlight),
    };
  }

  private homeworkScore(rows: any[], metrics: any[] = []): number | null {
    const latest = new Map<string, any>();
    for (const row of rows) {
      const id = String(row.homework_id || row.id);
      const previous = latest.get(id);
      if (!previous || LearningScoreService.attemptAt(row) >= LearningScoreService.attemptAt(previous)) latest.set(id, row);
    }
    if (!latest.size) return LearningScoreService.avg(metrics.filter((r) =>
      LearningScoreService.metricSource(r) === 'homework').map(metricScore));
    const scores = [...latest.values()].map(LearningScoreService.percentage).filter(Number.isFinite);
    const completion = Math.min(100, latest.size / 8 * 100);
    return scores.length ? 0.6 * (LearningScoreService.avg(scores) || 0) + 0.4 * completion : completion;
  }

  private practiceScore(games: any[], cards: any[], metrics: any[], activity: any[]): number | null {
    const scored = games.map(LearningScoreService.percentage).filter(Number.isFinite);
    const reviews = cards.reduce((sum: number, r: any) => sum + Number(r.review_count || 0), 0);
    if (reviews > 0) scored.push(cards.reduce((sum: number, r: any) => sum + Number(r.correct_count || 0), 0) / reviews * 100);
    scored.push(...metrics.filter((r: any) => !['test', 'mock_test', 'homework'].includes(
      LearningScoreService.metricSource(r),
    )).map(metricScore).filter(Number.isFinite));
    const types = new Set(['flashcards', 'revision', 'active_recall', 'explain_back', 'memory_challenge', 'word_problem', 'real_life', 'project', 'review']);
    const practice = activity.filter((r: any) => types.has(r.activity_type));
    const correct = practice.filter((r: any) => typeof r.correct === 'boolean');
    if (correct.length) scored.push(correct.filter((r: any) => r.correct).length / correct.length * 100);
    return LearningScoreService.avg(scored) ?? (practice.length ? Math.min(100, practice.length / 20 * 100) : null);
  }
  private static monthKey(t: number): string {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  // Keep returning students in the current academic year, ending in April.
  private static academicEndMs(createdAtMs: number): number {
    const created = new Date(Math.max(createdAtMs || 0, Date.now()));
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
    const oldest = new Date(endApril);
    oldest.setDate(1);
    oldest.setMonth(oldest.getMonth() - 23);
    if (cursor < oldest) cursor.setTime(new Date(oldest.getFullYear(), oldest.getMonth(), 1).getTime());
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
    const within = (t: number) => t > 0 && t <= (asOf ?? ctx.now);

    const attempts = ctx.attempts.filter((r: any) => within(LearningScoreService.attemptAt(r)));
    const hw = ctx.hwAttempts.filter((r: any) => within(LearningScoreService.ts(r.submitted_at, r.created_at)));
    const sessions = ctx.sessions.filter((r: any) => within(LearningScoreService.ts(r.ended_at, r.created_at)));
    const fc = ctx.fcProgress.filter((r: any) => within(LearningScoreService.ts(r.last_reviewed_at, r.updated_at, r.created_at)));
    const msgs = ctx.msgs.filter((r: any) => within(LearningScoreService.ts(r.created_at)));
    const rewards = ctx.rewards.filter((r: any) => within(LearningScoreService.ts(r.created_at, r.awarded_at)));
    const activity = ctx.activity.filter((r: any) => within(LearningScoreService.ts(r.occurred_at, r.created_at)));
    const reviews = (ctx.reviews || []).filter((r: any) => r.passed === true && within(LearningScoreService.ts(r.completed_at)));
    const pmetrics = ctx.pmetrics.filter((r: any) => within(LearningScoreService.ts(metricAt(r))));

    const eventCount = attempts.length + hw.length + sessions.length + fc.length + msgs.length + rewards.length + activity.length + reviews.length + pmetrics.length;

    // Tests: average percentage across graded attempts.
    const testPct = this.testScore(attempts, pmetrics);

    // Game/flashcard accuracy across sessions.
    const gameAcc = LearningScoreService.avg(
      sessions.map((s: any) => {
        const total = Number(s.total || 0);
        return total > 0 ? (Number(s.score || 0) / total) * 100 : NaN;
      }),
    );

    // Flashcard mastery from the Leitner boxes / correctness ledger.
    let boxPct: number | null = null;
    let reviewVol = 0;
    if (fc.length) {
      const totReview = fc.reduce((s: number, r: any) => s + Number(r.review_count || 0), 0);
      boxPct = (LearningScoreService.avg(fc.map((r: any) => Number(r.box || 0))) || 0) / 5 * 100;
      reviewVol = totReview;
    }

    // Homework: completion volume blended with graded score.
    const hwValue = this.homeworkScore(hw, pmetrics);
    const practiceValue = this.practiceScore(sessions, fc, pmetrics, activity);
    const orchard = this.orchardSnapshot(ctx, asOf);
    const rootsAvg = orchard.roots ?? 0;
    const sunlightAvg = orchard.sunlight;

    // Engagement counts.
    const userMsgs = msgs.filter((m: any) => String(m.role || '').toLowerCase() !== 'ai' && String(m.role || '').toLowerCase() !== 'assistant').length;
    const distinctChapters = new Set(
      [...sessions, ...activity, ...attempts, ...hw]
        .map((r: any) => r.chapter_id)
        .filter(Boolean)
        .map(String),
    ).size;
    const minutes =
      ctx.pmetrics
        .filter((r: any) => within(LearningScoreService.ts(metricAt(r))))
        .reduce((s: number, r: any) => s + metricMinutes(r), 0) +
      sessions.reduce((s: number, r: any) => s + Number(r.duration_ms || 0) / 60000, 0);
    const coins = rewards
      .filter((r: any) => String(r.reward_type || 'coin') === 'coin')
      .reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

    // Consistency: active-day cadence + orchard day streak.
    const activeDates = new Set(
      [...attempts.map((a: any) => LearningScoreService.attemptAt(a)),
       ...hw.map((h: any) => LearningScoreService.ts(h.submitted_at, h.created_at)),
       ...sessions.map((s: any) => LearningScoreService.ts(s.ended_at, s.created_at)),
       ...activity.map((r: any) => LearningScoreService.ts(r.occurred_at, r.created_at)),
       ...msgs.map((m: any) => LearningScoreService.ts(m.created_at)),
       ...fc.map((r: any) => LearningScoreService.ts(r.last_reviewed_at, r.updated_at, r.created_at)),
       ...reviews.map((r: any) => LearningScoreService.ts(r.completed_at)),
       ...pmetrics.map((r: any) => LearningScoreService.ts(metricAt(r))),
       ...rewards.map((r: any) => LearningScoreService.ts(r.created_at, r.awarded_at))]
        .filter((t) => t > 0)
        .map((t) => new Date(t).toISOString().slice(0, 10)),
    );
    const activeDays = activeDates.size;
    let dayStreak = 0;
    const latestDay = [...activeDates].sort().pop();
    if (latestDay) {
      const cursor = new Date(`${latestDay}T00:00:00Z`);
      while (activeDates.has(cursor.toISOString().slice(0, 10))) {
        dayStreak++;
        cursor.setUTCDate(cursor.getUTCDate() - 1);
      }
    }

    // ── assemble the nine dimensions (each 0..100) ───────────────────────────
    const understanding = LearningScoreService.clamp(
      0.4 * rootsAvg + 0.1 * (orchard.growth ?? 0) + 0.3 * (testPct ?? 0) + 0.2 * (practiceValue ?? 0),
    );
    const tests = LearningScoreService.clamp(testPct ?? 0);
    const homework = LearningScoreService.clamp(hwValue ?? 0);
    const revision = LearningScoreService.clamp(
      practiceValue !== null
        ? 0.4 * practiceValue + 0.3 * (boxPct ?? 0) + 0.3 * Math.min(100, (reviewVol / TARGETS.reviewsAllTime) * 100)
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
    const pending = this.pendingReports.get(studentId);
    if (pending) return pending;
    const request = this.calculateLearningScore(studentId);
    this.pendingReports.set(studentId, request);
    try {
      return await request;
    } finally {
      this.pendingReports.delete(studentId);
    }
  }

  private async calculateLearningScore(studentId: string): Promise<any> {
    const [rawAttempts, rawHwAttempts, fcProgress, sessions, profileRows, rawTrees, rawGrowth, rewards, msgs, pmetrics, activity, reviews, subjectKeys, studentRow, className, dbHomework] =
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
        this.rows('orchard_reviews', studentId),
        this.orchard.resolveStudentSubjectKeys(studentId),
        this.studentRecord(studentId),
        this.orchard.resolveStudentClassName(studentId),
        this.rows('homework', studentId),
      ]);
    const [tests, chapters] = await Promise.all([
      this.assignmentRows('tests', rawAttempts.map((r) => r.test_id), this.localFeed.listTests()),
      this.assignmentRows('orchard_chapters', rawGrowth.map((r) => r.chapter_id)),
    ]);
    const homeworkById = new Map(this.localFeed.listHomeworkForStudent(studentId).map((row) => [String(row.id), row]));
    for (const row of dbHomework) {
      const local = homeworkById.get(String(row.id));
      homeworkById.set(String(row.id), { ...local, ...row, subject: row.subject || local?.subject });
    }
    const homework = [...homeworkById.values()];
    const currentChapters = new Set(chapters.filter((r) =>
      String(r.class_name || '').trim().toLowerCase() === className.trim().toLowerCase()).map((r) => r.id));
    const allowedSubjects = new Set(subjectKeys.map(normalizeSubjectKey));
    const trees = rawTrees.filter((r) => allowedSubjects.has(normalizeSubjectKey(r.subject_key)));
    const growth = rawGrowth.filter((r) => currentChapters.has(r.chapter_id)
      && allowedSubjects.has(normalizeSubjectKey(r.subject_key)));
    const testSubjects = new Map(tests.map((r) => [r.id, r.subject]));
    const homeworkSubjects = new Map(homework.map((r) => [r.id, r.subject]));
    const attempts = rawAttempts.filter((r) => r.score !== null && r.score !== undefined)
      .map((r) => ({ ...r, subject: r.subject || testSubjects.get(r.test_id) }));
    const hwAttempts = this.homeworkEvidence(homework,
      rawHwAttempts.map((r) => ({ ...r, subject: r.subject || homeworkSubjects.get(r.homework_id) })), className);

    const totalEventCount =
      attempts.length + hwAttempts.length + sessions.length + fcProgress.length + msgs.length + rewards.length + activity.length
      + reviews.filter((r) => r.passed === true && r.completed_at).length + pmetrics.length;

    const ctx: any = {
      attempts, hwAttempts, fcProgress, sessions,
      profile: (profileRows && profileRows[0]) || null,
      trees, growth, rewards, msgs, pmetrics, activity, reviews, totalEventCount, now: Date.now(),
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
    const hasData = current.eventCount > 0 || current.overall > 0;

    // Dimension list for the UI (sorted by weight desc for a stable order).
    const dimensions = Object.keys(DIMENSION_WEIGHTS).map((key) => ({
      key,
      label: DIMENSION_LABELS[key],
      value: Math.round(current.dims[key] || 0),
      weight: DIMENSION_WEIGHTS[key],
    }));

    // Monthly growth trend — the same composite as the current score, using
    // only evidence available at each date. Runs from the
    // account-creation month all the way to the end of the academic year (April);
    // months still in the future carry a null score (drawn as the "road ahead").
    const buckets = LearningScoreService.monthBuckets(accountCreatedMs);
    const trend = buckets.map((b) => {
      if (b.future) return { key: b.key, label: b.label, score: null, value: null, future: true };
      const snap = this.computeDimensions(ctx, Math.min(b.end, ctx.now));
      return { key: b.key, label: b.label, score: Math.round(snap.overall * 10), value: Math.round(snap.overall), future: false };
    });

    // Daily growth trend — from the day the account was created (capped at 14
    // days), so students can watch their score climb day by day.
    const dayBk = LearningScoreService.dayBuckets(accountCreatedMs);
    const dailyTrend = dayBk.map((b) => {
      const snap = this.computeDimensions(ctx, Math.min(b.end, ctx.now));
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
    const attempts = ctx.attempts.filter((r: any) => inWin(LearningScoreService.attemptAt(r)));
    const hwAttempts = ctx.hwAttempts.filter((r: any) => inWin(LearningScoreService.ts(r.submitted_at, r.created_at)));
    const sessions = ctx.sessions.filter((r: any) => inWin(LearningScoreService.ts(r.ended_at, r.created_at)));
    const fcProgress = ctx.fcProgress.filter((r: any) => inWin(LearningScoreService.ts(r.last_reviewed_at, r.updated_at, r.created_at)));
    const msgs = ctx.msgs.filter((r: any) => inWin(LearningScoreService.ts(r.created_at)));
    const rewards = ctx.rewards.filter((r: any) => inWin(LearningScoreService.ts(r.created_at, r.awarded_at)));
    const activity = ctx.activity.filter((r: any) => inWin(LearningScoreService.ts(r.occurred_at, r.created_at)));
    const pmetrics = ctx.pmetrics.filter((r: any) => inWin(LearningScoreService.ts(metricAt(r))));
    const reviews = ctx.reviews.filter((r: any) => r.passed === true && inWin(LearningScoreService.ts(r.completed_at)));
    const totalEventCount = attempts.length + hwAttempts.length + sessions.length + fcProgress.length + msgs.length + rewards.length + activity.length + reviews.length + pmetrics.length;
    return {
      ...ctx, attempts, hwAttempts, sessions, fcProgress, msgs, rewards, activity, pmetrics, reviews,
      growth: ctx.growth.filter((r: any) => inWin(LearningScoreService.ts(r.stage_updated_at, r.updated_at))),
      totalEventCount,
    };
  }

  private subjectBreakdown(key: string, ctx: any, buckets: Array<{ key: string; label: string; end: number; future?: boolean }>, dayBuckets: Array<{ key: string; label: string; weekday?: string; end: number; future?: boolean }>): any {
    const meta = subjectEntryFor(key);
    const currentEvent = (at: number) => at > 0 && at <= ctx.now;
    const sTests = ctx.attempts.filter((a: any) => normalizeSubjectKey(a.subject) === key && currentEvent(LearningScoreService.attemptAt(a)));
    const matches = (r: any) => normalizeSubjectKey(r.subject_key || r.subject) === key;
    const sSessions = ctx.sessions.filter((r: any) => matches(r) && currentEvent(LearningScoreService.ts(r.ended_at, r.created_at)));
    const sFc = ctx.fcProgress.filter((r: any) => matches(r) && currentEvent(LearningScoreService.ts(r.last_reviewed_at, r.updated_at, r.created_at)));
    const sHw = ctx.hwAttempts.filter((r: any) => matches(r) && currentEvent(LearningScoreService.ts(r.submitted_at, r.created_at)));
    const sActivity = ctx.activity.filter((r: any) => matches(r) && currentEvent(LearningScoreService.ts(r.occurred_at, r.created_at)));
    const sReviews = ctx.reviews.filter(matches);
    const sMetrics = ctx.pmetrics.filter((r: any) => matches(r) && currentEvent(LearningScoreService.ts(metricAt(r))));
    const sTrees = ctx.trees.filter(matches);
    const sGrowth = ctx.growth.filter(matches);
    const snapshot = (asOf: number | null) => {
      const cutoff = asOf ?? ctx.now;
      const within = (at: number) => at > 0 && at <= cutoff;
      const tests = sTests.filter((r: any) => within(LearningScoreService.attemptAt(r)));
      const games = sSessions.filter((r: any) => within(LearningScoreService.ts(r.ended_at, r.created_at)));
      const cards = sFc.filter((r: any) => within(LearningScoreService.ts(r.last_reviewed_at, r.updated_at, r.created_at)));
      const hw = sHw.filter((r: any) => within(LearningScoreService.ts(r.submitted_at, r.created_at)));
      const activity = sActivity.filter((r: any) => within(LearningScoreService.ts(r.occurred_at, r.created_at)));
      const metrics = sMetrics.filter((r: any) => within(LearningScoreService.ts(metricAt(r))));
      const testPct = this.testScore(tests, metrics);
      const practiceAcc = this.practiceScore(games, cards, metrics, activity);
      const hwValue = this.homeworkScore(hw, metrics);
      const orchard = this.orchardSnapshot({ growth: sGrowth, trees: sTrees, activity: sActivity, reviews: sReviews, now: ctx.now }, asOf);
      const parts: Array<[number | null, number]> = [
        [orchard.growth, 0.2], [orchard.roots, 0.2], [testPct, 0.25], [practiceAcc, 0.2], [hwValue, 0.15],
      ];
      const available = parts.filter((p): p is [number, number] => p[0] !== null);
      const weights = available.reduce((sum, [, weight]) => sum + weight, 0);
      const score = weights ? Math.round(LearningScoreService.clamp(available.reduce((sum, [value, weight]) => sum + value * weight, 0) / weights)) : 0;
      return { score, testPct, practiceAcc, hwValue, rootsAvg: orchard.roots, treeProg: orchard.growth };
    };
    const { score, testPct, practiceAcc, hwValue, rootsAvg, treeProg } = snapshot(null);
    const totReview = sFc.reduce((s: number, r: any) => s + Number(r.review_count || 0), 0);
    const hasAny = sTests.length + sSessions.length + sHw.length + sActivity.length + sMetrics.length > 0
      || totReview > 0
      || (treeProg !== null && treeProg > 0)
      || (rootsAvg !== null && rootsAvg > 0);

    // Cumulative curve for this subject over any set of time buckets (reused
    // for both the monthly and the day-by-day views). Future months (past today)
    // carry a null value so the chart can draw them as the road still ahead.
    const curveFor = (bucketList: Array<{ key: string; label: string; weekday?: string; end: number; future?: boolean }>) =>
      bucketList.map((b) => {
        if (b.future) return { key: b.key, label: b.label, weekday: b.weekday, value: null, future: true };
        return { key: b.key, label: b.label, weekday: b.weekday, value: snapshot(Math.min(b.end, ctx.now)).score, future: false };
      });
    const trend = curveFor(buckets);
    const daily = curveFor(dayBuckets);

    const subjTrend = score - snapshot(ctx.now - 30 * 86400000).score;

    const status = !hasAny ? 'not-started' : score >= 75 ? 'strong' : score >= 50 ? 'on-track' : 'needs-focus';
    let tip = '';
    if (status === 'not-started') tip = `Start a ${meta.display_name} chapter or flashcard round to grow this subject.`;
    else if (status === 'needs-focus') tip = `Focus here: revise ${meta.display_name} lessons and attempt a short quiz to lift your score.`;
    else if (status === 'on-track') tip = `Good progress — keep practising ${meta.display_name} to reach mastery.`;
    else tip = `Excellent command of ${meta.display_name}. Keep it up!`;

    // ── Subject-specific "skills" (the same idea as the overall 9, but scoped
    // to just this subject) so the detail window mirrors the main report. ──────
    const metrics = [
      { key: 'understanding', emoji: '🧠', label: 'Understanding', value: Math.round(LearningScoreService.clamp(rootsAvg ?? 0)), desc: 'How deeply you get this subject' },
      { key: 'tests', emoji: '📝', label: 'Test Scores', value: Math.round(LearningScoreService.clamp(testPct ?? 0)), desc: 'How you did on tests and mock tests' },
      { key: 'practice', emoji: '🔁', label: 'Practice', value: Math.round(LearningScoreService.clamp(practiceAcc ?? 0)), desc: 'Practice accuracy, or revision task completion when unscored' },
      { key: 'growth', emoji: '🌳', label: 'Tree Growth', value: Math.round(LearningScoreService.clamp(treeProg ?? 0)), desc: 'How much your subject tree has grown' },
      { key: 'homework', emoji: '📚', label: 'Homework', value: Math.round(LearningScoreService.clamp(hwValue ?? 0)), desc: 'Completed assignments and available graded scores' },
    ];

    // Friendly raw counts for the detail window.
    const cardsReviewed = totReview;
    const distinctChapters = new Set(
      [...sTests, ...sSessions, ...sActivity, ...sFc, ...sGrowth.filter((g: any) => Number(g.stage_index || 0) > 0 || Number(g.roots_pct || 0) > 0)].map((r: any) => r.chapter_id).filter(Boolean).map(String),
    ).size;
    const bestTest = sTests.length
      ? Math.round(Math.max(...sTests.map(LearningScoreService.percentage).filter(Number.isFinite), 0))
      : 0;
    const stats = [
      { key: 'tests', emoji: '📝', label: 'Tests taken', value: sTests.length },
      { key: 'rounds', emoji: '🎮', label: 'Practice rounds', value: sSessions.length },
      { key: 'cards', emoji: '🃏', label: 'Cards reviewed', value: cardsReviewed },
      { key: 'chapters', emoji: '📖', label: 'Chapters touched', value: distinctChapters },
      { key: 'homework', emoji: '📚', label: 'Homework completed', value: new Set(sHw.map((r: any) => r.homework_id || r.id)).size },
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
