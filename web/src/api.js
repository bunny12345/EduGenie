// Minimal API client for the EduGenie backend
// If REACT_APP_USE_PROXY=1 prefer relative paths so CRA proxy (package.json) forwards to mock.
import supabase from './supabaseClient';

const useProxy = ['1', 'true', 'yes', 'on'].includes(String(process.env.REACT_APP_USE_PROXY || '').toLowerCase());
const API_BASE = useProxy ? '' : (process.env.REACT_APP_API_URL || (process.env.REACT_APP_USE_MOCK ? 'http://localhost:4000' : 'http://localhost:3000'));
let runtimeDevToken = '';

function withQuery(path, params = {}) {
  const q = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).length) q.set(k, String(v));
  });
  const qs = q.toString();
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
}

export function setRuntimeDevToken(token) {
  runtimeDevToken = String(token || '').trim();
}

export async function studentLogin(loginId, password) {
  const url = `${API_BASE}/auth/student/login`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId, password })
  });
  return res.json();
}

export async function teacherLogin(loginId, password) {
  const url = `${API_BASE}/auth/teacher/login`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId, password })
  });
  return res.json();
}

export async function schoolRegister(payload) {
  const url = `${API_BASE}/auth/school/register`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  });
  return res.json();
}

export async function schoolLogin(email, password) {
  const url = `${API_BASE}/auth/school/login`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  return res.json();
}

export async function getInviteInfo(token) {
  return getJson(`${API_BASE}/auth/invite/${encodeURIComponent(token)}`);
}

export async function acceptInvite(payload) {
  const url = `${API_BASE}/auth/invite/accept`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  });
  return res.json();
}

async function authHeaders() {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  } catch (e) {
    // ignore
  }
  const devToken = runtimeDevToken || process.env.REACT_APP_DEV_TOKEN || '';
  if (devToken) return { Authorization: `Bearer ${devToken}`, 'Content-Type': 'application/json' };
  return { 'Content-Type': 'application/json' };
}

async function getJson(url) {
  const headers = await authHeaders();
  const res = await fetch(url, { headers });
  return res.json();
}

async function getJsonStrict(url, label) {
  const headers = await authHeaders();
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${label} failed: ${res.status}`);
  return res.json();
}

// Throws if the backend returned { success: false, error: "..." } at HTTP 200
function checkSuccess(data, label) {
  if (data && data.success === false) {
    throw new Error(data.error || `${label} returned an error`);
  }
  return data;
}

async function getJsonChecked(url, label) {
  const data = await getJsonStrict(url, label);
  return checkSuccess(data, label);
}

export async function sendChat(studentId, message, personality, conversationId) {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ studentId, message, personality, conversationId })
  });
  return res.json();
}

export async function getChatHistory(studentId, conversationId) {
  let url = `${API_BASE}/chat/history?studentId=${encodeURIComponent(studentId)}`;
  if (conversationId) url += `&conversationId=${encodeURIComponent(conversationId)}`;
  return getJsonChecked(url, 'getChatHistory');
}

export async function listMemories(studentId) {
  // Backend exposes GET /chat/memories which returns { memories: [...] }
  const url = `${API_BASE}/chat/memories?studentId=${encodeURIComponent(studentId)}`;
  const headers = await authHeaders();
  const res = await fetch(url, { headers });
  const data = await res.json();
  // Normalize common shapes: { data: [...] } | { memories: [...] } | raw array
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.data)) return data.data;
  if (data && Array.isArray(data.memories)) return data.memories;
  return [];
}

export async function addMemory(studentId, value) {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/chat/memory`, {
    method: 'POST', headers, body: JSON.stringify({ studentId, value })
  });
  return res.json();
}

export async function getStudent(studentId) {
  const url = `${API_BASE}/chat/student?studentId=${encodeURIComponent(studentId)}`;
  return getJsonChecked(url, 'getStudent');
}

export async function saveStudent(payload) {
  const url = `${API_BASE}/chat/student`;
  const headers = await authHeaders();
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
  return res.json();
}

export async function getDashboard(studentId) {
  const url = `${API_BASE}/dashboard?studentId=${encodeURIComponent(studentId)}`;
  return getJsonChecked(url, 'getDashboard');
}

export async function getHomework(studentId) {
  const url = `${API_BASE}/homework?studentId=${encodeURIComponent(studentId)}`;
  return getJsonChecked(url, 'getHomework');
}

export async function submitHomework(homeworkId, studentId, answers, attachmentUrl) {
  const headers = await authHeaders();
  const url = `${API_BASE}/homework/${encodeURIComponent(homeworkId)}/submit`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ studentId, answers, attachmentUrl })
  });
  return res.json();
}

export async function getHomeworkAttempts(homeworkId, studentId) {
  const url = `${API_BASE}/homework/${encodeURIComponent(homeworkId)}/attempts?studentId=${encodeURIComponent(studentId)}`;
  return getJsonChecked(url, 'getHomeworkAttempts');
}

export async function getProgress(studentId, period = 'week') {
  const url = `${API_BASE}/progress?studentId=${encodeURIComponent(studentId)}&period=${encodeURIComponent(period)}`;
  return getJsonChecked(url, 'getProgress');
}

export async function getCalendar(studentId) {
  const url = `${API_BASE}/calendar?studentId=${encodeURIComponent(studentId)}`;
  return getJsonChecked(url, 'getCalendar');
}

export async function createCalendarEvent(payload) {
  const headers = await authHeaders();
  const url = `${API_BASE}/calendar`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload || {}) });
  if (!res.ok) throw new Error(`createCalendarEvent failed: ${res.status}`);
  const data = await res.json();
  if (data && data.success === false) throw new Error(data.error || 'Calendar create failed');
  return data;
}

export async function getRewards(studentId) {
  const url = `${API_BASE}/rewards?studentId=${encodeURIComponent(studentId)}`;
  return getJsonChecked(url, 'getRewards');
}

export async function earnReward(payload) {
  const headers = await authHeaders();
  const url = `${API_BASE}/rewards/earn`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload || {}) });
  if (!res.ok) throw new Error(`earnReward failed: ${res.status}`);
  return res.json();
}

export async function getTests(studentId, filter = 'upcoming') {
  const url = `${API_BASE}/tests?studentId=${encodeURIComponent(studentId)}&filter=${encodeURIComponent(filter)}`;
  return getJsonChecked(url, 'getTests');
}

export async function startTest(testId, studentId) {
  const headers = await authHeaders();
  const url = `${API_BASE}/tests/${encodeURIComponent(testId)}/start`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ studentId })
  });
  return res.json();
}

export async function submitTestAttempt(attemptId, studentId, answers) {
  const headers = await authHeaders();
  const url = `${API_BASE}/tests/attempts/${encodeURIComponent(attemptId)}/submit`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ studentId, answers })
  });
  return res.json();
}

export async function getTestAttempt(attemptId) {
  const url = `${API_BASE}/tests/attempts/${encodeURIComponent(attemptId)}`;
  return getJsonChecked(url, 'getTestAttempt');
}

export async function getLibrary(topic, level, page = 1) {
  const params = new URLSearchParams();
  if (topic) params.set('topic', topic);
  if (level) params.set('level', level);
  params.set('page', String(page));
  const url = `${API_BASE}/library?${params.toString()}`;
  return getJsonChecked(url, 'getLibrary');
}

export async function getLibraryResource(id) {
  const url = `${API_BASE}/library/${encodeURIComponent(id)}`;
  return getJsonChecked(url, 'getLibraryResource');
}

export async function getSettings(studentId) {
  const url = `${API_BASE}/settings?studentId=${encodeURIComponent(studentId)}`;
  return getJsonChecked(url, 'getSettings');
}

export async function saveSettings(payload) {
  const headers = await authHeaders();
  const url = `${API_BASE}/settings`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  return res.json();
}

export async function recordProgress(payload) {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/progress`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload || {})
  });
  if (!res.ok) throw new Error(`recordProgress failed: ${res.status}`);
  const data = await res.json();
  if (data && data.success === false) throw new Error(data.error || 'recordProgress failed');
  return data;
}

export async function createTest(payload) {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/tests/create`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload || {})
  });
  if (!res.ok) throw new Error(`createTest failed: ${res.status}`);
  const data = await res.json();
  if (data && data.success === false) throw new Error(data.error || 'createTest failed');
  return data;
}

export async function addTestQuestion(testId, payload) {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/tests/${encodeURIComponent(testId)}/questions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload || {})
  });
  if (!res.ok) throw new Error(`addTestQuestion failed: ${res.status}`);
  const data = await res.json();
  if (data && data.success === false) throw new Error(data.error || 'addTestQuestion failed');
  return data;
}

export async function updateTestQuestion(testId, questionId, payload) {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/tests/${encodeURIComponent(testId)}/questions/${encodeURIComponent(questionId)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload || {})
  });
  if (!res.ok) throw new Error(`updateTestQuestion failed: ${res.status}`);
  const data = await res.json();
  if (data && data.success === false) throw new Error(data.error || 'updateTestQuestion failed');
  return data;
}

export async function deleteTestQuestion(testId, questionId) {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/tests/${encodeURIComponent(testId)}/questions/${encodeURIComponent(questionId)}`, {
    method: 'DELETE',
    headers
  });
  if (!res.ok) throw new Error(`deleteTestQuestion failed: ${res.status}`);
  const data = await res.json();
  if (data && data.success === false) throw new Error(data.error || 'deleteTestQuestion failed');
  return data;
}

export async function listTestQuestions(testId) {
  const url = `${API_BASE}/tests/${encodeURIComponent(testId)}/questions`;
  return getJsonChecked(url, 'listTestQuestions');
}

export async function deleteTest(testId) {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/tests/${encodeURIComponent(testId)}`, {
    method: 'DELETE',
    headers
  });
  if (!res.ok) throw new Error(`deleteTest failed: ${res.status}`);
  return res.json();
}

export async function updateTest(testId, payload) {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/tests/${encodeURIComponent(testId)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload || {})
  });
  if (!res.ok) throw new Error(`updateTest failed: ${res.status}`);
  const data = await res.json();
  if (data && data.success === false) throw new Error(data.error || 'updateTest failed');
  return data;
}

export async function cloneTest(testId, payload) {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/tests/${encodeURIComponent(testId)}/clone`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload || {})
  });
  if (!res.ok) throw new Error(`cloneTest failed: ${res.status}`);
  const data = await res.json();
  if (data && data.success === false) throw new Error(data.error || 'cloneTest failed');
  return data;
}

export async function getTeacherDashboard() {
  const res = await fetch(withQuery('/teacher/dashboard'), {
    headers: await authHeaders()
  });
  if (!res.ok) throw new Error(`getTeacherDashboard failed: ${res.status}`);
  const data = await res.json();
  return checkSuccess(data, 'getTeacherDashboard');
}

export async function getTeacherStudents(query) {
  const q = String(query || '').trim();
  const res = await fetch(withQuery('/teacher/students', q ? { q } : {}), {
    headers: await authHeaders()
  });
  if (!res.ok) throw new Error(`getTeacherStudents failed: ${res.status}`);
  const data = await res.json();
  return checkSuccess(data, 'getTeacherStudents');
}

export async function getTeacherStudentProgress(studentId) {
  const res = await fetch(`${API_BASE}/teacher/students/${encodeURIComponent(studentId)}/progress`, {
    headers: await authHeaders()
  });
  if (!res.ok) throw new Error(`getTeacherStudentProgress failed: ${res.status}`);
  const data = await res.json();
  return checkSuccess(data, 'getTeacherStudentProgress');
}

export async function registerTeacherStudent(payload) {
  const headers = await authHeaders();
  const url = `${API_BASE}/teacher/students/register`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload || {})
  });
  return res.json();
}

export async function createTeacherStudentInvite(payload) {
  const headers = await authHeaders();
  const url = `${API_BASE}/teacher/invites/student`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload || {})
  });
  return res.json();
}

export async function listTeacherStudentInvites(params) {
  const qp = new URLSearchParams();
  if (params?.q) qp.set('q', String(params.q));
  if (params?.status && String(params.status) !== 'all') qp.set('status', String(params.status));
  if (params?.page) qp.set('page', String(params.page));
  if (params?.limit) qp.set('limit', String(params.limit));
  const query = qp.toString();
  const url = query
    ? `${API_BASE}/teacher/invites/student?${query}`
    : `${API_BASE}/teacher/invites/student`;
  const res = await fetch(url, {
    headers: await authHeaders()
  });
  if (!res.ok) throw new Error(`listTeacherStudentInvites failed: ${res.status}`);
  const data = await res.json();
  return checkSuccess(data, 'listTeacherStudentInvites');
}

export async function revokeTeacherStudentInvite(token) {
  const headers = await authHeaders();
  const url = `${API_BASE}/teacher/invites/student/${encodeURIComponent(token)}/revoke`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({}) });
  return res.json();
}

export async function resendTeacherStudentInvite(token, payload) {
  const headers = await authHeaders();
  const url = `${API_BASE}/teacher/invites/student/${encodeURIComponent(token)}/resend`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload || {})
  });
  return res.json();
}

export async function schoolDashboard() {
  const res = await fetch(withQuery('/school/dashboard'), {
    headers: await authHeaders()
  });
  if (!res.ok) throw new Error(`schoolDashboard failed: ${res.status}`);
  const data = await res.json();
  return checkSuccess(data, 'schoolDashboard');
}

export async function schoolTeachers(params) {
  const res = await fetch(withQuery('/school/teachers', params || {}), {
    headers: await authHeaders()
  });
  if (!res.ok) throw new Error(`schoolTeachers failed: ${res.status}`);
  const data = await res.json();
  return checkSuccess(data, 'schoolTeachers');
}

export async function schoolInvites(params) {
  const query = { ...(params || {}) };
  if (String(query.status || 'all') === 'all') delete query.status;
  const res = await fetch(withQuery('/school/invites', query), {
    headers: await authHeaders()
  });
  if (!res.ok) throw new Error(`schoolInvites failed: ${res.status}`);
  const data = await res.json();
  return checkSuccess(data, 'schoolInvites');
}

export async function schoolStudents(params) {
  const res = await fetch(withQuery('/school/students', params || {}), {
    headers: await authHeaders()
  });
  if (!res.ok) throw new Error(`schoolStudents failed: ${res.status}`);
  const data = await res.json();
  return checkSuccess(data, 'schoolStudents');
}

export async function schoolRegisterTeacher(payload) {
  const headers = await authHeaders();
  const url = `${API_BASE}/school/teachers/register`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload || {})
  });
  return res.json();
}

export async function schoolInviteTeacher(payload) {
  const headers = await authHeaders();
  const url = `${API_BASE}/school/invites/teacher`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload || {})
  });
  return res.json();
}

export async function revokeSchoolTeacherInvite(token) {
  const headers = await authHeaders();
  const url = `${API_BASE}/school/invites/teacher/${encodeURIComponent(token)}/revoke`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({}) });
  return res.json();
}

export async function resendSchoolTeacherInvite(token, payload) {
  const headers = await authHeaders();
  const url = `${API_BASE}/school/invites/teacher/${encodeURIComponent(token)}/resend`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload || {})
  });
  return res.json();
}

export async function assignTeacherHomework(payload) {
  const headers = await authHeaders();
  const url = `${API_BASE}/teacher/homework/assign`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload || {})
  });
  return res.json();
}

export async function getTeacherAnnouncements() {
  const res = await fetch(withQuery('/teacher/announcements'), {
    headers: await authHeaders()
  });
  if (!res.ok) throw new Error(`getTeacherAnnouncements failed: ${res.status}`);
  const data = await res.json();
  return checkSuccess(data, 'getTeacherAnnouncements');
}

export async function postTeacherAnnouncement(payload) {
  const headers = await authHeaders();
  const url = `${API_BASE}/teacher/announcements`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload || {})
  });
  return res.json();
}

export async function askTeacherAi(prompt) {
  const headers = await authHeaders();
  const url = `${API_BASE}/teacher/ai/assist`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ prompt })
  });
  return res.json();
}

const api = {
  sendChat,
  listMemories,
  addMemory,
  getStudent,
  saveStudent,
  getDashboard,
  getHomework,
  submitHomework,
  getHomeworkAttempts,
  getProgress,
  recordProgress,
  getCalendar,
  createCalendarEvent,
  getRewards,
  earnReward,
  getChatHistory,
  getTests,
  startTest,
  submitTestAttempt,
  getTestAttempt,
  createTest,
  addTestQuestion,
  updateTestQuestion,
  deleteTestQuestion,
  listTestQuestions,
  deleteTest,
  updateTest,
  cloneTest,
  getLibrary,
  getLibraryResource,
  getSettings,
  saveSettings,
  getTeacherDashboard,
  getTeacherStudents,
  getTeacherStudentProgress,
  assignTeacherHomework,
  getTeacherAnnouncements,
  postTeacherAnnouncement,
  askTeacherAi,
  studentLogin,
  registerTeacherStudent,
  teacherLogin,
  schoolRegister,
  schoolLogin,
  getInviteInfo,
  acceptInvite,
  createTeacherStudentInvite,
  listTeacherStudentInvites,
  schoolDashboard,
  schoolTeachers,
  schoolInvites,
  schoolStudents,
  schoolRegisterTeacher,
  schoolInviteTeacher
};
export default api;
