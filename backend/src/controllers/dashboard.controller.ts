import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { AuthGuard } from '../auth/auth.guard';
import { LocalFeedService } from '../shared/local-feed.service';
import { StudentAuthService } from '../auth/student-auth.service';
import { METRIC_ORDER_COLUMN, metricAt, metricScore } from '../progress/progress-metric.util';

@Controller('dashboard')
export class DashboardController {
  private static cache = new Map<string, { expiresAt: number; value: any }>();

  constructor(
    private readonly db: SupabaseService,
    private readonly localFeed: LocalFeedService,
    private readonly studentAuth: StudentAuthService
  ) {}

  @Get()
  @UseGuards(AuthGuard)
  async getDashboard(@Req() req: any, @Query('studentId') studentId: string) {
    const id = req.studentId || studentId;
    // The dashboard carries the class's teacher list, which is what the student
    // portal builds its subject nav from. Keying the cache on the roster version
    // means a newly registered (or removed) subject teacher is reflected on the
    // next request instead of up to a TTL later.
    const cacheKey = `dashboard:${id}:${StudentAuthService.rosterVersion}`;
    const now = Date.now();
    const cached = DashboardController.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.value;

    try {
      // Resolve the student's identity from the DB with a local-store fallback so
      // newly-registered students (whose `students` row may not have landed) get
      // their real name, class and school just like long-standing accounts.
      const profile = await this.studentAuth.resolveStudentProfile(id);
      const student = {
        id,
        name: profile.name || null,
        class_name: profile.className || null,
        school_id: profile.schoolId || null,
        teacher_id: profile.teacherId || null,
      };

      // Fetch gender, loginId and school name for profile card
      let gender: string | null = null;
      let loginId: string | null = null;
      let schoolName: string | null = null;
      try {
        const stuRows = await this.db.client.from('students').select('gender,login_id').eq('id', id).limit(1);
        const stuRow = Array.isArray((stuRows as any)?.data) ? (stuRows as any).data[0] : null;
        gender = stuRow?.gender || null;
        loginId = stuRow?.login_id || null;
        if (!loginId) {
          const accRows = await this.db.client.from('student_accounts').select('login_id,gender').eq('student_id', id).limit(1);
          const accRow = Array.isArray((accRows as any)?.data) ? (accRows as any).data[0] : null;
          loginId = accRow?.login_id || null;
          if (!gender) gender = accRow?.gender || null;
        }
      } catch { /* non-fatal */ }
      if (!gender || !loginId) {
        const local = this.studentAuth.getLocalStudent(id);
        if (local) {
          if (!gender) gender = local.gender || null;
          if (!loginId) loginId = local.loginId || null;
        }
      }
      try {
        if (student.school_id) {
          const schRows = await this.db.client.from('schools').select('school_name').eq('id', student.school_id).limit(1);
          const schRow = Array.isArray((schRows as any)?.data) ? (schRows as any).data[0] : null;
          schoolName = schRow?.school_name || null;
        }
      } catch { /* non-fatal */ }

      const hw = await this.db.client.from('homework').select('*').eq('student_id', id).order('due_at', { ascending: true }).limit(8);
      const homeworkRows = (hw && (hw as any).data) || [];
      const mergedHomeworkRows = Array.isArray(homeworkRows) && homeworkRows.length
        ? homeworkRows
        : this.localFeed.listHomeworkForStudent(id);
      // Filter homework by student's class to prevent cross-class leakage
      const studentClassName = String(student?.class_name || '').trim().toLowerCase();
      const classFilteredHomework = (Array.isArray(mergedHomeworkRows) ? mergedHomeworkRows : []).filter((h: any) => {
        if (!studentClassName) return true;
        const hwClass = String(h?.class_name || '').trim().toLowerCase();
        return !hwClass || hwClass === studentClassName;
      });
      const todayPlan = classFilteredHomework.slice(0, 6).map((h: any) => ({
        type: 'homework',
        title: h.title || h.file_url || 'Homework task',
        dueAt: h.due_at || h.created_at || null,
        status: h.status || (h.graded ? 'completed' : 'pending')
      }));

      const pm = await this.db.client.from('progress_metrics').select('*').eq('student_id', id).order(METRIC_ORDER_COLUMN, { ascending: false }).limit(10);
      const progressRows = (pm && (pm as any).data) || [];

      const subjectsMap = new Map<string, { scoreSum: number; count: number }>();
      for (const r of Array.isArray(progressRows) ? progressRows : []) {
        const name = r.subject || r.metric_key || 'General';
        const score = metricScore(r);
        if (!Number.isFinite(score)) continue;
        const prev = subjectsMap.get(name) || { scoreSum: 0, count: 0 };
        prev.scoreSum += score;
        prev.count += 1;
        subjectsMap.set(name, prev);
      }

      const subjects = Array.from(subjectsMap.entries()).map(([name, v], idx) => ({
        id: `${idx + 1}`,
        name,
        score: Math.round(v.scoreSum / Math.max(v.count, 1)),
        goal: 85
      }));

      const memRes = await this.db.client.from('memories').select('*').eq('student_id', id).limit(6);
      const memRows = (memRes && (memRes as any).data) || [];
      const recommendations = (Array.isArray(memRows) ? memRows : []).slice(0, 4).map((m: any) => ({
        topic: m.key || 'study topic',
        reason: m.value || 'Recommended from your learning pattern'
      }));

      const ann = await this.db.client
        .from('announcements')
        .select('*')
        .in('audience', ['students', 'all'])
        .order('created_at', { ascending: false })
        .limit(8);
      const announcementRows = (ann && (ann as any).data) || [];
      const announcements = (Array.isArray(announcementRows) ? announcementRows : []).map((a: any) => ({
        id: a.id,
        title: a.title || 'Announcement',
        message: a.message || '',
        audience: a.audience || 'students',
        createdAt: a.created_at || null
      }));
      const mergedAnnouncements = announcements.length ? announcements : this.localFeed.listAnnouncements();

      const streak = await this.computeLearningStreak(id, mergedHomeworkRows, progressRows);

      // Teachers responsible for this student's class (with their subjects), so
      // the student portal can show "My Teachers" for their class.
      let classTeachers: Array<{ id: string; name: string; subject: string }> = [];
      try {
        const schoolId = student?.school_id || null;
        const className = student?.class_name || null;
        if (schoolId && className) {
          classTeachers = await this.studentAuth.listClassTeachers(schoolId, className);
        }
      } catch (_e) {
        classTeachers = [];
      }

      const dashboard = {
        greetingName: student?.name || null,
        className: student?.class_name || null,
        gender,
        loginId,
        schoolName,
        todayPlan,
        subjects,
        classTeachers,
        streak,
        recommendations,
        announcements: mergedAnnouncements
      };

      const response = {
        success: true,
        dashboard,
        ...dashboard
      };

      // Roster changes mint new cache keys, so drop stale entries as we go
      // instead of letting the map grow for the lifetime of the process.
      for (const [key, entry] of DashboardController.cache) {
        if (entry.expiresAt <= now) DashboardController.cache.delete(key);
      }
      DashboardController.cache.set(cacheKey, { expiresAt: now + 10_000, value: response });
      return response;
    } catch (e) {
      const dashboard = { greetingName: null, todayPlan: [], subjects: [], classTeachers: [], streak: { days: 0, longest: 0, activeToday: false, atRisk: false, freezeUsed: false, freezesAvailable: 1, maxFreezes: 1, milestones: [], nextMilestone: 7, daysToNextMilestone: 7, activeDates: [], lastActiveDate: null }, recommendations: [], announcements: [] };
      return { success: false, error: String((e as any)?.message || e || 'dashboard failed'), dashboard, ...dashboard };
    }
  }

  // ─── real learning streak ────────────────────────────────────────────────────
  // A "learning streak" = consecutive calendar days on which the student did ANY
  // real learning activity: submitting homework, taking a test, logging progress,
  // or nurturing their orchard. Kids care a lot about streaks, so this is derived
  // strictly from real data across every activity source (never a fixed number).
  //
  // Extras (kid-motivation features):
  //   • Streak freeze — one free missed day is bridged so a single slip doesn't
  //     wipe out a long streak.
  //   • Milestone badges — 7 / 30 / 100-day achievements earned from the best run.
  //   • At-risk nudge — flags when there's a live streak but nothing done today yet.
  private async computeLearningStreak(
    id: string,
    homeworkRows: any[],
    progressRows: any[],
  ): Promise<{
    days: number;
    longest: number;
    activeToday: boolean;
    atRisk: boolean;
    freezeUsed: boolean;
    freezesAvailable: number;
    maxFreezes: number;
    milestones: Array<{ days: number; label: string; icon: string; earned: boolean }>;
    nextMilestone: number | null;
    daysToNextMilestone: number | null;
    activeDates: string[];
    lastActiveDate: string | null;
  }> {
    const MAX_FREEZES = 1; // one free miss protects a long streak
    const MILESTONE_DEFS: Array<{ days: number; label: string; icon: string }> = [
      { days: 7, label: 'Week Warrior', icon: '🔥' },
      { days: 30, label: 'Monthly Master', icon: '🏆' },
      { days: 100, label: 'Century Legend', icon: '👑' },
    ];

    const emptyMilestones = MILESTONE_DEFS.map((m) => ({ ...m, earned: false }));
    const empty = {
      days: 0,
      longest: 0,
      activeToday: false,
      atRisk: false,
      freezeUsed: false,
      freezesAvailable: MAX_FREEZES,
      maxFreezes: MAX_FREEZES,
      milestones: emptyMilestones,
      nextMilestone: MILESTONE_DEFS[0].days,
      daysToNextMilestone: MILESTONE_DEFS[0].days,
      activeDates: [] as string[],
      lastActiveDate: null as string | null,
    };

    const days = new Set<string>();
    const todayStr = this.dayString(new Date());
    const add = (v: any) => {
      if (!v) return;
      const s = String(v);
      const day = (s.includes('T') ? s.split('T')[0] : s.slice(0, 10));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
      if (day > todayStr) return; // ignore future-dated rows — activity can't be in the future
      days.add(day);
    };

    // 1) Homework the student actually submitted.
    for (const h of Array.isArray(homeworkRows) ? homeworkRows : []) {
      if (h?.submitted_at) add(h.submitted_at);
      else if (String(h?.status || '').toLowerCase() === 'submitted' || String(h?.due_status || '').toLowerCase() === 'submitted') {
        add(h.updated_at || h.created_at);
      }
    }

    // 2) Progress metrics logged.
    for (const p of Array.isArray(progressRows) ? progressRows : []) {
      add(metricAt(p));
    }

    // 3) Test attempts.
    try {
      const ta = await this.db.client.from('test_attempts').select('*').eq('student_id', id).limit(500);
      for (const a of ((ta as any)?.data || [])) add(a?.started_at || a?.submitted_at || a?.finished_at || a?.completed_at || a?.created_at);
    } catch { /* table may not exist in some envs */ }

    // 4) Orchard nurturing activity.
    try {
      const oa = await this.db.client.from('orchard_activity').select('*').eq('student_id', id).limit(1000);
      for (const a of ((oa as any)?.data || [])) add(a?.occurred_at || a?.created_at);
    } catch { /* orchard optional */ }

    if (!days.size) return empty;

    const sorted = Array.from(days).sort(); // ascending YYYY-MM-DD
    const yesterdayStr = this.dayString(new Date(Date.now() - 86400000));
    const activeToday = days.has(todayStr);

    // Current streak: alive if today or yesterday has activity, then count back.
    // A single missing day inside the run is bridged by a freeze (one free miss).
    let current = 0;
    let freezesRemaining = MAX_FREEZES;
    let freezeUsed = false;
    const anchor: string | null = days.has(todayStr) ? todayStr : days.has(yesterdayStr) ? yesterdayStr : null;
    if (anchor) {
      const cursor = new Date(anchor + 'T00:00:00Z');
      while (true) {
        const dstr = cursor.toISOString().split('T')[0];
        if (days.has(dstr)) {
          current += 1;
          cursor.setUTCDate(cursor.getUTCDate() - 1);
          continue;
        }
        // Missing day: bridge it with a freeze if we still have one AND the day
        // just before the gap was active (i.e. only a SINGLE missed day).
        const before = new Date(cursor.getTime() - 86400000).toISOString().split('T')[0];
        if (freezesRemaining > 0 && current > 0 && days.has(before)) {
          freezesRemaining -= 1;
          freezeUsed = true;
          cursor.setUTCDate(cursor.getUTCDate() - 1); // skip the frozen gap day
          continue;
        }
        break;
      }
    }

    // Longest streak ever (max consecutive run across all active days).
    let longest = 0;
    let run = 0;
    let prev: Date | null = null;
    for (const d of sorted) {
      const cur = new Date(d + 'T00:00:00Z');
      if (prev && (cur.getTime() - prev.getTime()) === 86400000) run += 1;
      else run = 1;
      if (run > longest) longest = run;
      prev = cur;
    }
    longest = Math.max(longest, current); // a freeze-bridged current run can exceed raw runs

    // Milestone badges — earned from the best streak reached.
    const best = Math.max(longest, current);
    const milestones = MILESTONE_DEFS.map((m) => ({ ...m, earned: best >= m.days }));
    const nextDef = MILESTONE_DEFS.find((m) => current < m.days) || null;
    const nextMilestone = nextDef ? nextDef.days : null;
    const daysToNextMilestone = nextDef ? Math.max(0, nextDef.days - current) : null;

    // At-risk = there's a live streak but nothing done today yet.
    const atRisk = current > 0 && !activeToday;

    return {
      days: current,
      longest,
      activeToday,
      atRisk,
      freezeUsed,
      freezesAvailable: freezesRemaining,
      maxFreezes: MAX_FREEZES,
      milestones,
      nextMilestone,
      daysToNextMilestone,
      activeDates: sorted.slice(-60),
      lastActiveDate: sorted[sorted.length - 1] || null,
    };
  }

  private dayString(d: Date): string {
    return d.toISOString().split('T')[0];
  }
}
