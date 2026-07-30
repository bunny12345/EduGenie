import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { SupabaseService } from '../supabase.service';
import {
  ACTIVITY_EFFECTS,
  clampPct,
  computeStage,
  DEFAULT_CHAPTERS_PER_SUBJECT,
  healthFromWater,
  Milestones,
  seasonForDate,
  STAGE_INDEX,
  STAGE_LABEL,
  STAGES,
  SubjectCatalogEntry,
  SUBJECT_CATALOG,
  SUBJECT_BY_KEY,
  treeStageFromCompletion,
  normalizeSubjectKey,
} from './orchard.constants';

const METER_WINDOW_DAYS = 14; // rolling window for water/sunlight/fertilizer
const DEFAULT_CLASS = 'Class 7';

interface ActivityInput {
  subjectKey: string;
  chapterId?: string;
  activityType: string;
  correct?: boolean;
  occurredAt?: string; // ISO — caller-supplied for historical/month-wise seeding
}

@Injectable()
export class OrchardService {
  constructor(private readonly db: SupabaseService) {}

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

  // ─── catalog ───────────────────────────────────────────────────────────────
  async getCatalog(): Promise<SubjectCatalogEntry[]> {
    const rows = await this.selectRows('orchard_subjects', []);
    if (Array.isArray(rows) && rows.length) {
      return rows
        .map((r) => ({
          subject_key: r.subject_key,
          display_name: r.display_name,
          tree_type: r.tree_type,
          fruit_type: r.fruit_type,
          fruit_emoji: r.fruit_emoji,
          tree_emoji: r.tree_emoji,
          accent_color: r.accent_color,
          order_index: Number(r.order_index || 0),
        }))
        .sort((a, b) => a.order_index - b.order_index);
    }
    return SUBJECT_CATALOG;
  }

  // ─── which subjects does this student actually have? ─────────────────────────
  // Mirrors the student portal's subject nav so the orchard only shows trees for
  // subjects that are actually registered/present for the student. The portal
  // (StudentDashboard) builds its subject list from a small default baseline plus
  // whatever subjects appear in the student's homework, tests and progress — which
  // are driven by the teacher(s) registered for their class. We resolve the same
  // sources here and keep only canonical subjects that exist in the tree catalog.
  async resolveStudentSubjectKeys(studentId: string): Promise<string[]> {
    // Baseline mirrors StudentDashboard DEFAULT_SUBJECTS = ['Science','Mathematics','Social'].
    const names = new Set<string>(['Science', 'Mathematics', 'Social']);

    // Subjects seen in the student's own homework / tests / progress metrics.
    for (const [table, field] of [
      ['homework', 'subject'],
      ['test_attempts', 'subject'],
      ['progress_metrics', 'subject'],
    ] as Array<[string, string]>) {
      const rows = await this.selectRows(table, [['student_id', studentId]]);
      for (const r of rows || []) {
        const s = r[field] || r.metric_key;
        if (s) names.add(String(s));
      }
    }

    // Normalize free-text names to canonical keys and keep only catalog subjects.
    const catalog = await this.getCatalog();
    const catalogKeys = new Set(catalog.map((c) => c.subject_key));
    const keys = new Set<string>();
    for (const n of names) {
      const k = normalizeSubjectKey(n);
      if (k && catalogKeys.has(k)) keys.add(k);
    }
    // Safety net: never show an empty orchard — fall back to the portal defaults.
    if (!keys.size) ['mathematics', 'science', 'social'].forEach((k) => keys.add(k));
    return Array.from(keys);
  }

  // ─── class resolution ────────────────────────────────────────────────────────
  private async resolveClassName(studentId: string): Promise<string> {
    // 1) students table (real DB)
    const rows = await this.selectRows('students', [['id', studentId]]);
    const s = rows && rows[0];
    if (s) {
      const c = s.class_name || s.class || s.className;
      if (c) return String(c);
    }
    // 2) local accounts file
    try {
      const file = path.join(process.cwd(), 'local-data', 'student-accounts.json');
      if (fs.existsSync(file)) {
        const list = JSON.parse(fs.readFileSync(file, 'utf8'));
        const acct = Array.isArray(list) ? list.find((a: any) => a.studentId === studentId) : null;
        if (acct && acct.className) return String(acct.className);
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_CLASS;
  }

  // ─── ensure chapters (seeds) exist for a subject + class ─────────────────────
  private async ensureChapters(subjectKey: string, className: string): Promise<any[]> {
    let chapters = await this.selectRows('orchard_chapters', [
      ['subject_key', subjectKey],
      ['class_name', className],
    ]);
    if (chapters && chapters.length) {
      return chapters.sort((a, b) => Number(a.order_index || 0) - Number(b.order_index || 0));
    }
    // Generate a default set of chapters for this subject + class.
    const created: any[] = [];
    for (let i = 1; i <= DEFAULT_CHAPTERS_PER_SUBJECT; i++) {
      const row = {
        subject_key: subjectKey,
        class_name: className,
        chapter_number: i,
        title: `Chapter ${i}`,
        order_index: i,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      created.push(await this.insertRow('orchard_chapters', row));
    }
    return created;
  }

  // ─── ensure per-student profile ──────────────────────────────────────────────
  private async ensureProfile(studentId: string): Promise<any> {
    const rows = await this.selectRows('orchard_profile', [['student_id', studentId]]);
    if (rows && rows[0]) return rows[0];
    const row = {
      student_id: studentId,
      water_drops: 0,
      sunshine: 0,
      gems: 0,
      companion_level: 1,
      companion_xp: 0,
      companion_xp_max: 1200,
      day_streak: 0,
      last_active_date: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return this.insertRow('orchard_profile', row);
  }

  // ─── ensure a tree + its chapter_growth seeds for a subject ──────────────────
  private async ensureTree(studentId: string, subject: SubjectCatalogEntry, className: string): Promise<any> {
    const chapters = await this.ensureChapters(subject.subject_key, className);

    let trees = await this.selectRows('orchard_trees', [
      ['student_id', studentId],
      ['subject_key', subject.subject_key],
    ]);
    let tree = trees && trees[0];
    if (!tree) {
      tree = await this.insertRow('orchard_trees', {
        student_id: studentId,
        subject_key: subject.subject_key,
        stage: 'seed',
        level: 1,
        max_level: 7,
        total_chapters: chapters.length,
        completed_chapters: 0,
        progress_pct: 0,
        roots_pct: 0,
        water_pct: 0,
        sunlight_pct: 0,
        fertilizer_pct: 0,
        health: 'healthy',
        season: seasonForDate(new Date()),
        next_chapter_id: chapters[0] ? chapters[0].id : null,
        last_activity_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    // Ensure a chapter_growth row for every chapter.
    const growth = await this.selectRows('chapter_growth', [
      ['student_id', studentId],
      ['subject_key', subject.subject_key],
    ]);
    const haveByChapter = new Set((growth || []).map((g) => String(g.chapter_id)));
    for (const ch of chapters) {
      if (haveByChapter.has(String(ch.id))) continue;
      await this.insertRow('chapter_growth', {
        student_id: studentId,
        chapter_id: ch.id,
        subject_key: subject.subject_key,
        stage: 'seed',
        stage_index: 0,
        roots_pct: 0,
        milestones: {},
        is_golden: false,
        fruit_collected: false,
        started_at: null,
        stage_updated_at: new Date().toISOString(),
        fruit_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    return tree;
  }

  // ─── ensure the whole orchard exists for a student ───────────────────────────
  async ensureOrchard(studentId: string): Promise<{ className: string; catalog: SubjectCatalogEntry[] }> {
    const className = await this.resolveClassName(studentId);
    // Only build trees for the subjects this student actually has (mirrors the
    // student portal). Subjects not registered for the student get no tree.
    const allowed = new Set(await this.resolveStudentSubjectKeys(studentId));
    const catalog = (await this.getCatalog()).filter((s) => allowed.has(s.subject_key));
    await this.ensureProfile(studentId);
    for (const subject of catalog) {
      await this.ensureTree(studentId, subject, className);
    }
    return { className, catalog };
  }

  // ─── meters from recent activity (relative to latest activity for seeding) ───
  private computeMeters(activity: any[]): { water: number; sunlight: number; fertilizer: number; asOf: number } {
    if (!activity || !activity.length) return { water: 0, sunlight: 0, fertilizer: 0, asOf: 0 };
    const times = activity.map((a) => new Date(a.occurred_at || a.created_at || Date.now()).getTime());
    const latest = Math.max(...times);
    const windowStart = latest - METER_WINDOW_DAYS * 24 * 3600 * 1000;
    let water = 0;
    let sunlight = 0;
    let fertilizer = 0;
    for (const a of activity) {
      const t = new Date(a.occurred_at || a.created_at || Date.now()).getTime();
      if (t < windowStart) continue;
      water += Number(a.water || 0);
      sunlight += Number(a.sunlight || 0);
      fertilizer += Number(a.fertilizer || 0);
    }
    // Scale raw counts into 0..100 meters (each point ≈ 4%).
    return {
      water: clampPct(water * 4),
      sunlight: clampPct(sunlight * 5),
      fertilizer: clampPct(fertilizer * 6),
      asOf: latest,
    };
  }

  // ─── LIVE meters relative to NOW → real decay over time ──────────────────────
  // Used on the READ path so a tree gets thirsty/wilting (and its mood turns
  // sad/sleepy) when the student stops studying. Each watering activity fades as
  // it ages out of the rolling window, so the meters drop smoothly with time.
  private computeLiveMeters(activity: any[]): {
    water: number;
    sunlight: number;
    fertilizer: number;
    lastActivityMs: number;
    daysSinceLast: number | null;
  } {
    const now = Date.now();
    const windowMs = METER_WINDOW_DAYS * 24 * 3600 * 1000;
    const windowStart = now - windowMs;
    let water = 0;
    let sunlight = 0;
    let fertilizer = 0;
    let lastActivityMs = 0;
    for (const a of activity || []) {
      const t = new Date(a.occurred_at || a.created_at || now).getTime();
      if (t > now) continue; // ignore future-dated rows for decay math
      if (t > lastActivityMs) lastActivityMs = t;
      if (t < windowStart) continue;
      // Fade older activity: fresh = full weight, ~14 days old ≈ 0.
      const weight = 1 - (now - t) / windowMs;
      water += Number(a.water || 0) * weight;
      sunlight += Number(a.sunlight || 0) * weight;
      fertilizer += Number(a.fertilizer || 0) * weight;
    }
    return {
      water: clampPct(water * 5),
      sunlight: clampPct(sunlight * 6),
      fertilizer: clampPct(fertilizer * 7),
      lastActivityMs,
      daysSinceLast: lastActivityMs ? Math.floor((now - lastActivityMs) / (24 * 3600 * 1000)) : null,
    };
  }

  // Fetch a student's activity grouped by subject_key (one query) for live reads.
  private async activityBySubject(studentId: string): Promise<Map<string, any[]>> {
    const rows = await this.selectRows('orchard_activity', [['student_id', studentId]]);
    const map = new Map<string, any[]>();
    for (const r of rows || []) {
      const k = String(r.subject_key || '');
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return map;
  }

  // Derive the tree's facial mood from its stage + live health (mirrors the
  // frontend moodForState so the drawn face matches what the API reports).
  private moodForTree(stage: string, health: string): string {
    if (stage === 'golden_fruit') return 'excited';
    if (health === 'wilting') return 'sleepy';
    if (health === 'thirsty') return 'sad';
    return 'happy';
  }

  // ─── LIVE profile currencies derived from REAL activity + tree state ─────────
  // The header counters (Water Drops / Sunshine / Gems / Harvest / streak /
  // companion) are computed from the student's actual orchard_activity log and
  // their trees' progress, instead of trusting cached/seeded numbers. This keeps
  // every counter honest and in sync with what the student really did.
  private computeLiveProfile(
    allActivity: any[],
    trees: Array<{ completedChapters?: number; stage?: string }>,
  ): {
    waterDrops: number;
    sunshine: number;
    gems: number;
    companionLevel: number;
    companionXp: number;
    companionXpMax: number;
    dayStreak: number;
    harvest: number;
    activeDates: string[];
  } {
    let waterDrops = 0;
    let sunshine = 0;
    let totalXp = 0;
    const activeDays = new Set<string>();
    for (const a of allActivity || []) {
      const w = Number(a.water || 0);
      const s = Number(a.sunlight || 0);
      waterDrops += w;
      sunshine += s;
      totalXp += w + s + 5; // matches bumpProfile's per-activity XP
      const day = String(a.occurred_at || a.created_at || '').split('T')[0];
      if (day) activeDays.add(day);
    }

    // Gems are a rare mastery currency: earned per fruited chapter, with a big
    // bonus for fully golden (100%-complete) subjects.
    const totalCompleted = trees.reduce((sum, t) => sum + Number(t.completedChapters || 0), 0);
    const harvest = trees.filter((t) => t.stage === 'golden_fruit').length;
    const gems = totalCompleted * 3 + harvest * 25;

    // Companion level/xp from lifetime XP (level up every 1200 XP).
    const companionXpMax = 1200;
    const companionLevel = 1 + Math.floor(totalXp / companionXpMax);
    const companionXp = totalXp % companionXpMax;

    // Day streak = consecutive calendar days with activity, counting back from
    // the most recent active day (today or yesterday keeps the streak "live").
    const dayStreak = this.streakFromDays(activeDays);

    // Real calendar of study days (last 60) so the UI can mark true activity.
    const activeDates = Array.from(activeDays).sort().slice(-60);

    return { waterDrops, sunshine, gems, companionLevel, companionXp, companionXpMax, dayStreak, harvest, activeDates };
  }

  // Count consecutive days ending at the latest active day.
  private streakFromDays(activeDays: Set<string>): number {
    if (!activeDays.size) return 0;
    const sorted = Array.from(activeDays).sort(); // ascending YYYY-MM-DD
    let cursor = new Date(sorted[sorted.length - 1] + 'T00:00:00Z');
    let streak = 0;
    while (activeDays.has(cursor.toISOString().split('T')[0])) {
      streak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    return streak;
  }

  // ─── recompute a tree's aggregate state from its chapters + activity ─────────
  private async recomputeTree(studentId: string, subjectKey: string): Promise<any> {
    const growth = await this.selectRows('chapter_growth', [
      ['student_id', studentId],
      ['subject_key', subjectKey],
    ]);
    const activity = await this.selectRows('orchard_activity', [
      ['student_id', studentId],
      ['subject_key', subjectKey],
    ]);
    const chapters = await this.selectRows('orchard_chapters', [['subject_key', subjectKey]]);
    const orderByChapter = new Map((chapters || []).map((c) => [String(c.id), Number(c.order_index || c.chapter_number || 0)]));

    const total = growth.length || 0;
    let rootsSum = 0;
    let completed = 0;

    for (const g of growth) {
      const idx = Number(g.stage_index || 0);
      rootsSum += Number(g.roots_pct || 0);
      if (idx >= STAGE_INDEX['fruit']) completed += 1;
    }

    // Next chapter to nurture: keep focus on the chapter already in progress
    // (closest to fruiting) so activities don't scatter across untouched seeds.
    const fruitIdx = STAGE_INDEX['fruit'];
    const withOrder = growth.map((g) => ({ g, idx: Number(g.stage_index || 0), order: orderByChapter.get(String(g.chapter_id)) ?? 0 }));
    const inProgress = withOrder
      .filter((x) => x.idx > 0 && x.idx < fruitIdx)
      .sort((a, b) => b.idx - a.idx || a.order - b.order);
    const seeds = withOrder.filter((x) => x.idx === 0).sort((a, b) => a.order - b.order);
    let nextChapterId: string | null = null;
    if (inProgress.length) nextChapterId = inProgress[0].g.chapter_id;
    else if (seeds.length) nextChapterId = seeds[0].g.chapter_id;

    // Tree stage is driven by how many chapters the student has FINISHED
    // (reached fruit) out of the subject's total, independent of chapter count.
    // Golden fruit appears only when every chapter is finished.
    const { stage: treeStage, index: roundedIdx } = treeStageFromCompletion(completed, total);
    const progressPct = clampPct(total ? (completed / total) * 100 : 0);
    const rootsPct = clampPct(total ? rootsSum / total : 0);
    const level = Math.max(1, Math.min(7, roundedIdx + 1));

    const meters = this.computeMeters(activity);
    const health = healthFromWater(meters.water);
    const lastActivityAt = meters.asOf ? new Date(meters.asOf).toISOString() : null;
    const season = meters.asOf ? seasonForDate(new Date(meters.asOf)) : seasonForDate(new Date());

    const changes = {
      stage: treeStage,
      level,
      total_chapters: total,
      completed_chapters: completed,
      progress_pct: progressPct,
      roots_pct: rootsPct,
      water_pct: meters.water,
      sunlight_pct: meters.sunlight,
      fertilizer_pct: meters.fertilizer,
      health,
      season,
      next_chapter_id: nextChapterId,
      last_activity_at: lastActivityAt,
    };
    await this.updateRows('orchard_trees', changes, [
      ['student_id', studentId],
      ['subject_key', subjectKey],
    ]);
    const trees = await this.selectRows('orchard_trees', [
      ['student_id', studentId],
      ['subject_key', subjectKey],
    ]);
    return (trees && trees[0]) || { student_id: studentId, subject_key: subjectKey, ...changes };
  }

  // Public wrapper so seeding/maintenance scripts can refresh a tree's aggregate
  // state using the exact same engine formula (no logic duplication).
  async recomputeSubject(studentId: string, subjectKey: string): Promise<any> {
    return this.recomputeTree(studentId, subjectKey);
  }

  // ─── record a learning activity → drive growth ──────────────────────────────
  async recordActivity(studentId: string, input: ActivityInput): Promise<any> {
    const subjectKey = input.subjectKey;
    if (!SUBJECT_BY_KEY[subjectKey]) {
      return { success: false, error: `unknown subject ${subjectKey}` };
    }
    await this.ensureOrchard(studentId);
    const effect = ACTIVITY_EFFECTS[input.activityType];
    if (!effect) return { success: false, error: `unknown activity ${input.activityType}` };

    const occurredAt = input.occurredAt || new Date().toISOString();

    // Resolve a target chapter: explicit, else the current "next" chapter.
    let chapterId = input.chapterId;
    if (!chapterId) {
      const trees = await this.selectRows('orchard_trees', [
        ['student_id', studentId],
        ['subject_key', subjectKey],
      ]);
      chapterId = trees && trees[0] && trees[0].next_chapter_id;
    }

    // Append the activity log entry.
    const sunlight = effect.sunlight + (input.correct === true ? 1 : 0);
    await this.insertRow('orchard_activity', {
      student_id: studentId,
      subject_key: subjectKey,
      chapter_id: chapterId || null,
      activity_type: input.activityType,
      water: effect.water,
      sunlight,
      fertilizer: effect.fertilizer,
      correct: input.correct ?? null,
      occurred_at: occurredAt,
      created_at: new Date().toISOString(),
    });

    // Update the target chapter's milestones + roots + stage.
    if (chapterId) {
      const rows = await this.selectRows('chapter_growth', [
        ['student_id', studentId],
        ['chapter_id', chapterId],
      ]);
      const g = rows && rows[0];
      if (g) {
        const milestones: Milestones = { ...(g.milestones || {}) };
        for (const m of effect.milestones) milestones[m] = true;
        const roots = clampPct(Number(g.roots_pct || 0) + effect.roots + (input.correct === true ? 2 : 0));
        const { stage, index } = computeStage(milestones, roots);
        const prevIdx = Number(g.stage_index || 0);
        const changes: any = {
          milestones,
          roots_pct: roots,
          stage,
          stage_index: index,
          stage_updated_at: occurredAt,
          started_at: g.started_at || occurredAt,
        };
        if (stage === 'golden_fruit') changes.is_golden = true;
        if (index >= STAGE_INDEX['fruit'] && prevIdx < STAGE_INDEX['fruit']) changes.fruit_at = occurredAt;
        await this.updateRows('chapter_growth', changes, [
          ['student_id', studentId],
          ['chapter_id', chapterId],
        ]);

        // When a chapter first reaches mature_tree, schedule retention reviews.
        if (index >= STAGE_INDEX['mature_tree'] && prevIdx < STAGE_INDEX['mature_tree']) {
          await this.scheduleReviews(studentId, subjectKey, chapterId, occurredAt);
        }
      }
    }

    // Update currencies on the profile.
    await this.bumpProfile(studentId, effect.water, sunlight, occurredAt);

    const tree = await this.recomputeTree(studentId, subjectKey);
    return { success: true, tree };
  }

  private async scheduleReviews(studentId: string, subjectKey: string, chapterId: string, fromIso: string): Promise<void> {
    const from = new Date(fromIso).getTime();
    const week = new Date(from + 7 * 24 * 3600 * 1000).toISOString();
    const month = new Date(from + 30 * 24 * 3600 * 1000).toISOString();
    const existing = await this.selectRows('orchard_reviews', [
      ['student_id', studentId],
      ['chapter_id', chapterId],
    ]);
    const haveTypes = new Set((existing || []).map((r) => r.review_type));
    if (!haveTypes.has('week')) {
      await this.insertRow('orchard_reviews', {
        student_id: studentId,
        chapter_id: chapterId,
        subject_key: subjectKey,
        review_type: 'week',
        scheduled_at: week,
        completed_at: null,
        passed: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    if (!haveTypes.has('month')) {
      await this.insertRow('orchard_reviews', {
        student_id: studentId,
        chapter_id: chapterId,
        subject_key: subjectKey,
        review_type: 'month',
        scheduled_at: month,
        completed_at: null,
        passed: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }

  private async bumpProfile(studentId: string, water: number, sunlight: number, occurredAt: string): Promise<void> {
    const rows = await this.selectRows('orchard_profile', [['student_id', studentId]]);
    const p = rows && rows[0];
    if (!p) return;
    const xp = Number(p.companion_xp || 0) + water + sunlight + 5;
    const xpMax = Number(p.companion_xp_max || 1200);
    let level = Number(p.companion_level || 1);
    let carryXp = xp;
    while (carryXp >= xpMax) {
      carryXp -= xpMax;
      level += 1;
    }
    const day = String(occurredAt).split('T')[0];
    const changes = {
      water_drops: Number(p.water_drops || 0) + water,
      sunshine: Number(p.sunshine || 0) + sunlight,
      companion_xp: carryXp,
      companion_level: level,
      last_active_date: day,
    };
    await this.updateRows('orchard_profile', changes, [['student_id', studentId]]);
  }

  // ─── complete a spaced-repetition review → advance to blossom/fruit ──────────
  async completeReview(studentId: string, input: { chapterId: string; reviewType: 'week' | 'month'; passed: boolean; occurredAt?: string }): Promise<any> {
    const occurredAt = input.occurredAt || new Date().toISOString();
    const rows = await this.selectRows('chapter_growth', [
      ['student_id', studentId],
      ['chapter_id', input.chapterId],
    ]);
    const g = rows && rows[0];
    if (!g) return { success: false, error: 'chapter not found' };

    await this.updateRows(
      'orchard_reviews',
      { completed_at: occurredAt, passed: input.passed },
      [
        ['student_id', studentId],
        ['chapter_id', input.chapterId],
        ['review_type', input.reviewType],
      ],
    );

    if (input.passed) {
      const milestones: Milestones = { ...(g.milestones || {}) };
      if (input.reviewType === 'week') milestones.week_retention = true;
      if (input.reviewType === 'month') {
        milestones.week_retention = true; // month implies week
        milestones.month_retention = true;
      }
      const roots = clampPct(Number(g.roots_pct || 0) + (input.reviewType === 'month' ? 8 : 4));
      const { stage, index } = computeStage(milestones, roots);
      const changes: any = {
        milestones,
        roots_pct: roots,
        stage,
        stage_index: index,
        stage_updated_at: occurredAt,
      };
      if (stage === 'golden_fruit') changes.is_golden = true;
      if (index >= STAGE_INDEX['fruit']) changes.fruit_at = g.fruit_at || occurredAt;
      await this.updateRows('chapter_growth', changes, [
        ['student_id', studentId],
        ['chapter_id', input.chapterId],
      ]);
    }

    const tree = await this.recomputeTree(studentId, g.subject_key);
    return { success: true, tree };
  }

  // ─── read: full orchard overview ─────────────────────────────────────────────
  async getOrchard(studentId: string): Promise<any> {
    const { catalog } = await this.ensureOrchard(studentId);
    const treeRows = await this.selectRows('orchard_trees', [['student_id', studentId]]);
    const byKey = new Map((treeRows || []).map((t) => [t.subject_key, t]));
    // Live meters relative to NOW so trees decay when the student stops studying.
    const activityMap = await this.activityBySubject(studentId);

    const trees = catalog.map((subject) => {
      const t = byKey.get(subject.subject_key) || {};
      const live = this.computeLiveMeters(activityMap.get(subject.subject_key) || []);
      const health = healthFromWater(live.water);
      return {
        subjectKey: subject.subject_key,
        subject: subject.display_name,
        treeType: subject.tree_type,
        fruitType: subject.fruit_type,
        fruitEmoji: subject.fruit_emoji,
        treeEmoji: subject.tree_emoji,
        accentColor: subject.accent_color,
        stage: t.stage || 'seed',
        stageLabel: STAGE_LABEL[(t.stage || 'seed') as keyof typeof STAGE_LABEL],
        level: t.level || 1,
        maxLevel: t.max_level || 7,
        totalChapters: t.total_chapters || 0,
        completedChapters: t.completed_chapters || 0,
        progressPct: t.progress_pct || 0,
        rootsPct: t.roots_pct || 0,
        waterPct: live.water,
        sunlightPct: live.sunlight,
        fertilizerPct: live.fertilizer,
        health,
        mood: this.moodForTree(t.stage || 'seed', health),
        daysSinceLast: live.daysSinceLast,
        season: seasonForDate(new Date()),
      };
    });

    const overallProgress = trees.length
      ? Math.round(trees.reduce((sum, t) => sum + (t.progressPct || 0), 0) / trees.length)
      : 0;

    // Live currencies from the real activity log + tree state (see helper).
    const allActivity = Array.from(activityMap.values()).flat();
    const live = this.computeLiveProfile(allActivity, trees);

    return {
      success: true,
      profile: {
        waterDrops: live.waterDrops,
        sunshine: live.sunshine,
        gems: live.gems,
        harvest: live.harvest,
        companionLevel: live.companionLevel,
        companionXp: live.companionXp,
        companionXpMax: live.companionXpMax,
        dayStreak: live.dayStreak,
        activeDates: live.activeDates,
      },
      overallProgress,
      trees,
    };
  }

  // ─── read: single tree detail with its chapters ──────────────────────────────
  async getTree(studentId: string, subjectKey: string): Promise<any> {
    if (!SUBJECT_BY_KEY[subjectKey]) return { success: false, error: 'unknown subject' };
    await this.ensureOrchard(studentId);
    const subject = (await this.getCatalog()).find((s) => s.subject_key === subjectKey) || SUBJECT_BY_KEY[subjectKey];
    const treeRows = await this.selectRows('orchard_trees', [
      ['student_id', studentId],
      ['subject_key', subjectKey],
    ]);
    const t = (treeRows && treeRows[0]) || {};
    const chapterRows = await this.selectRows('orchard_chapters', [['subject_key', subjectKey]]);
    const growthRows = await this.selectRows('chapter_growth', [
      ['student_id', studentId],
      ['subject_key', subjectKey],
    ]);
    const growthByChapter = new Map((growthRows || []).map((g) => [String(g.chapter_id), g]));

    const chapters = (chapterRows || [])
      .sort((a, b) => Number(a.order_index || 0) - Number(b.order_index || 0))
      .map((ch) => {
        const g = growthByChapter.get(String(ch.id)) || {};
        return {
          chapterId: ch.id,
          chapterNumber: ch.chapter_number,
          title: ch.title,
          stage: g.stage || 'seed',
          stageLabel: STAGE_LABEL[(g.stage || 'seed') as keyof typeof STAGE_LABEL],
          stageIndex: Number(g.stage_index || 0),
          rootsPct: Number(g.roots_pct || 0),
          isGolden: Boolean(g.is_golden),
          fruitCollected: Boolean(g.fruit_collected),
          milestones: g.milestones || {},
        };
      });

    const nextChapter = chapters.find((c) => c.chapterId === t.next_chapter_id) || chapters.find((c) => c.stageIndex === 0) || null;

    // Live meters relative to NOW so this tree decays when study stops.
    const activity = await this.selectRows('orchard_activity', [
      ['student_id', studentId],
      ['subject_key', subjectKey],
    ]);
    const live = this.computeLiveMeters(activity);
    const stage = t.stage || 'seed';
    const health = healthFromWater(live.water);

    return {
      success: true,
      subjectKey,
      subject: subject.display_name,
      treeType: subject.tree_type,
      fruitType: subject.fruit_type,
      fruitEmoji: subject.fruit_emoji,
      treeEmoji: subject.tree_emoji,
      accentColor: subject.accent_color,
      tree: {
        stage,
        stageLabel: STAGE_LABEL[stage as keyof typeof STAGE_LABEL],
        level: t.level || 1,
        maxLevel: t.max_level || 7,
        totalChapters: t.total_chapters || chapters.length,
        completedChapters: t.completed_chapters || 0,
        progressPct: t.progress_pct || 0,
        rootsPct: t.roots_pct || 0,
        waterPct: live.water,
        sunlightPct: live.sunlight,
        fertilizerPct: live.fertilizer,
        health,
        mood: this.moodForTree(stage, health),
        daysSinceLast: live.daysSinceLast,
        season: seasonForDate(new Date()),
      },
      nextChapter,
      chapters,
    };
  }
}
