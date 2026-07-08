import { Injectable } from '@nestjs/common';

@Injectable()
export class LocalFeedService {
  private announcements: any[] = [];
  private homeworkAssignments: any[] = [];
  private tests: any[] = [];
  private questionsByTest = new Map<string, any[]>();
  private attempts = new Map<string, any>();

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
}
