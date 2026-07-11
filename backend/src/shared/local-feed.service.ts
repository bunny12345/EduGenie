import { Injectable, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'local-data');
const FEED_FILE = path.join(DATA_DIR, 'local-feed.json');

@Injectable()
export class LocalFeedService implements OnModuleInit {
  private announcements: any[] = [];
  private homeworkAssignments: any[] = [];
  private tests: any[] = [];
  private questionsByTest = new Map<string, any[]>();
  private attempts = new Map<string, any>();
  private events: any[] = [];
  private rewardsByStudent = new Map<string, { coins: number; badges: any[]; recentRewards: any[] }>();
  private activityByStudent = new Map<string, any[]>();

  onModuleInit() {
    try {
      if (fs.existsSync(FEED_FILE)) {
        const saved = JSON.parse(fs.readFileSync(FEED_FILE, 'utf8'));
        if (Array.isArray(saved?.homework)) {
          this.homeworkAssignments = saved.homework;
          // eslint-disable-next-line no-console
          console.log(`[local-feed] Loaded ${this.homeworkAssignments.length} persisted homework assignments`);
        }
      }
    } catch (_e) { /* corrupt/missing file – start fresh */ }
  }

  private persistFeed() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(FEED_FILE, JSON.stringify({ homework: this.homeworkAssignments }), 'utf8');
    } catch (_e) { /* non-fatal */ }
  }

  addAnnouncements(items: any[]) {
    const next = Array.isArray(items) ? items : [];
    if (!next.length) return;
    this.announcements = [...next, ...this.announcements].slice(0, 200);
  }

  listAnnouncements() {
    return [...this.announcements];
  }

  addHomework(items: any[]) {
    const next = Array.isArray(items) ? items : [];
    if (!next.length) return;
    this.homeworkAssignments = [...next, ...this.homeworkAssignments].slice(0, 2000);
    this.persistFeed();
  }

  listHomeworkForStudent(studentId: string) {
    const id = String(studentId || '').trim();
    if (!id) return [];
    return this.homeworkAssignments.filter((h) => String(h?.student_id || h?.studentId || '') === id);
  }

  listHomeworkForStudents(studentIds: string[]) {
    const ids = new Set((Array.isArray(studentIds) ? studentIds : []).map((x) => String(x || '').trim()).filter(Boolean));
    if (!ids.size) return [];
    return this.homeworkAssignments.filter((h) => ids.has(String(h?.student_id || h?.studentId || '').trim()));
  }

  listHomeworkByTeacher(teacherId: string) {
    const id = String(teacherId || '').trim();
    if (!id) return this.homeworkAssignments.slice(0, 200);
    return this.homeworkAssignments.filter((h) => {
      const createdBy = String(h?.created_by || '').trim();
      const metaTeacherId = String(h?.tasks?.meta?.teacherId || '').trim();
      return createdBy === id || metaTeacherId === id;
    });
  }

  upsertTest(test: any) {
    if (!test) return;
    const id = String(test.id || '').trim() || `local-test-${Date.now()}`;
    const normalized = { ...test, id };
    const idx = this.tests.findIndex((t) => String(t?.id || '') === id);
    if (idx >= 0) this.tests[idx] = { ...this.tests[idx], ...normalized };
    else this.tests.unshift(normalized);
    this.tests = this.tests.slice(0, 500);
  }

  listTests() {
    return [...this.tests];
  }

  removeTest(testId: string) {
    const id = String(testId || '').trim();
    if (!id) return;
    this.tests = this.tests.filter((t) => String(t?.id || '') !== id);
    this.questionsByTest.delete(id);
  }

  setQuestions(testId: string, questions: any[]) {
    const id = String(testId || '').trim();
    if (!id) return;
    this.questionsByTest.set(id, Array.isArray(questions) ? questions.map((q) => ({ ...q })) : []);
  }

  upsertQuestion(testId: string, question: any) {
    const id = String(testId || '').trim();
    if (!id || !question) return;
    const list = [...(this.questionsByTest.get(id) || [])];
    const qid = String(question.id || '').trim() || `local-q-${Date.now()}`;
    const normalized = { ...question, id: qid, test_id: id, testId: id };
    const idx = list.findIndex((q) => String(q?.id || '') === qid);
    if (idx >= 0) list[idx] = { ...list[idx], ...normalized };
    else list.push(normalized);
    this.questionsByTest.set(id, list);
  }

  removeQuestion(testId: string, questionId: string) {
    const id = String(testId || '').trim();
    const qid = String(questionId || '').trim();
    if (!id || !qid) return;
    const list = [...(this.questionsByTest.get(id) || [])].filter((q) => String(q?.id || '') !== qid);
    this.questionsByTest.set(id, list);
  }

  listQuestions(testId: string) {
    const id = String(testId || '').trim();
    if (!id) return [];
    return [...(this.questionsByTest.get(id) || [])];
  }

  createAttempt(testId: string, studentId: string) {
    const id = `local-attempt-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const row = {
      id,
      test_id: testId,
      student_id: studentId,
      started_at: new Date().toISOString(),
      finished_at: null,
      score: null,
      feedback: null
    };
    this.attempts.set(id, row);
    return row;
  }

  getAttempt(attemptId: string) {
    return this.attempts.get(String(attemptId || '').trim()) || null;
  }

  finishAttempt(attemptId: string, patch: any) {
    const id = String(attemptId || '').trim();
    const row = this.attempts.get(id);
    if (!row) return null;
    const next = { ...row, ...(patch || {}), finished_at: (patch || {}).finished_at || new Date().toISOString() };
    this.attempts.set(id, next);
    return next;
  }

  addEvent(event: any) {
    if (!event) return null;
    const normalized = {
      ...event,
      id: event.id || `local-evt-${Date.now()}-${Math.floor(Math.random() * 10000)}`
    };
    const idx = this.events.findIndex((x) => String(x?.id || '') === String(normalized.id));
    if (idx >= 0) this.events[idx] = { ...this.events[idx], ...normalized };
    else this.events.unshift(normalized);
    this.events = this.events.slice(0, 2000);
    return normalized;
  }

  listEventsForStudent(studentId: string) {
    const id = String(studentId || '').trim();
    if (!id) return [];
    return this.events.filter((e) => String(e?.student_id || e?.studentId || '') === id);
  }

  removeEvent(eventId: string) {
    const id = String(eventId || '').trim();
    if (!id) return;
    this.events = this.events.filter((e) => String(e?.id || '') !== id);
  }

  getRewards(studentId: string) {
    const id = String(studentId || '').trim();
    if (!id) return { coins: 0, badges: [], recentRewards: [] };
    const row = this.rewardsByStudent.get(id);
    return row ? { coins: row.coins, badges: [...row.badges], recentRewards: [...row.recentRewards] } : { coins: 0, badges: [], recentRewards: [] };
  }

  addReward(studentId: string, reward: any) {
    const id = String(studentId || '').trim();
    if (!id) return { coins: 0, badges: [], recentRewards: [] };
    const prev = this.rewardsByStudent.get(id) || { coins: 0, badges: [], recentRewards: [] };
    const amount = Math.max(0, Number(reward?.amount || reward?.coins || 0));
    const normalizedReward = {
      id: reward?.id || `local-rwd-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      type: reward?.type || reward?.reward_type || 'coin',
      label: reward?.label || reward?.reason || 'Reward',
      amount,
      createdAt: reward?.createdAt || reward?.created_at || new Date().toISOString()
    };
    const next = {
      coins: prev.coins + amount,
      badges: Array.isArray(prev.badges) ? [...prev.badges] : [],
      recentRewards: [normalizedReward, ...(Array.isArray(prev.recentRewards) ? prev.recentRewards : [])].slice(0, 20)
    };
    this.rewardsByStudent.set(id, next);
    return next;
  }

  setRewards(studentId: string, payload: any) {
    const id = String(studentId || '').trim();
    if (!id) return;
    this.rewardsByStudent.set(id, {
      coins: Number(payload?.coins || 0),
      badges: Array.isArray(payload?.badges) ? payload.badges : [],
      recentRewards: Array.isArray(payload?.recentRewards) ? payload.recentRewards : []
    });
  }

  logStudentActivity(studentId: string, activity: any) {
    const id = String(studentId || '').trim();
    if (!id) return null;
    const entry = {
      id: activity?.id || `local-activity-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      studentId: id,
      type: activity?.type || 'activity',
      action: activity?.action || 'performed',
      title: activity?.title || 'Activity',
      details: activity?.details || '',
      meta: activity?.meta || null,
      createdAt: activity?.createdAt || new Date().toISOString()
    };
    const prev = this.activityByStudent.get(id) || [];
    this.activityByStudent.set(id, [entry, ...prev].slice(0, 200));
    return entry;
  }

  listStudentActivity(studentId: string) {
    const id = String(studentId || '').trim();
    if (!id) return [];
    return [...(this.activityByStudent.get(id) || [])];
  }
}
