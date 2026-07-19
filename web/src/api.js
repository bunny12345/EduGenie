// Minimal API client for the EduGenie backend
// If REACT_APP_USE_PROXY=1 prefer relative paths so CRA proxy (package.json) forwards to mock.
import supabase from './supabaseClient';

const useProxy = ['1', 'true', 'yes', 'on'].includes(String(process.env.REACT_APP_USE_PROXY || '').toLowerCase());
const API_BASE = useProxy ? '' : (process.env.REACT_APP_API_URL || (process.env.REACT_APP_USE_MOCK ? 'http://localhost:4000' : 'http://localhost:3000'));
let runtimeDevToken = '';
const DISABLE_AUTH_EXPIRE_EVENTS = true;

function parseJwtPayload(token) {
  try {
    const raw = String(token || '').replace(/^Bearer\s+/i, '').trim();
    if (!raw) return null;
    const parts = raw.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4 || 4)) % 4);
    return JSON.parse(atob(padded));
  } catch (e) {
    return null;
  }
}

function isJwtExpired(token) {
  const payload = parseJwtPayload(token);
  const exp = Number(payload?.exp || 0);
  if (!exp) return false;
  return Date.now() >= exp * 1000;
}

function notifyExpiredAuth() {
  if (DISABLE_AUTH_EXPIRE_EVENTS) return;
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('edugenie.authExpired'));
}

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
  const runtimeToken = String(runtimeDevToken || '').trim();
  if (runtimeToken && !isJwtExpired(runtimeToken)) {
    return { Authorization: `Bearer ${runtimeToken}`, 'Content-Type': 'application/json' };
  }
  if (runtimeToken && isJwtExpired(runtimeToken)) notifyExpiredAuth();

  // Session fallback: after page reload there can be a brief window before
  // runtime token is rehydrated into memory.
  try {
    if (typeof window !== 'undefined') {
      const raw = window.localStorage.getItem('edugenie.session');
      const parsed = raw ? JSON.parse(raw) : null;
      const sessionToken = String(parsed?.token || '').trim();
      if (sessionToken && !isJwtExpired(sessionToken)) {
        return { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };
      }
      if (sessionToken && isJwtExpired(sessionToken)) notifyExpiredAuth();
    }
  } catch {
    // Ignore localStorage parse/access issues.
  }

  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token && !isJwtExpired(token)) return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    if (token && isJwtExpired(token)) notifyExpiredAuth();
  } catch (e) {
    // ignore
  }
  const devToken = String(process.env.REACT_APP_DEV_TOKEN || '').trim();
  if (devToken && !isJwtExpired(devToken)) return { Authorization: `Bearer ${devToken}`, 'Content-Type': 'application/json' };
  if (devToken && isJwtExpired(devToken)) notifyExpiredAuth();
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
  if (res.status === 401 || res.status === 403) notifyExpiredAuth();
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

export async function sendChat(studentId, message, personality, conversationId, recentMessages, imageDataUrl, imageDataUrls, imageNames) {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ studentId, message, personality, conversationId, recentMessages, imageDataUrl, imageDataUrls, imageNames })
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

export async function uploadHomeworkImage(file) {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/homework/upload`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      fileName: file?.name || 'upload.png',
      mimeType: file?.type || 'image/png',
      data: await fileToDataUrl(file)
    })
  });
  if (!res.ok) throw new Error(`uploadHomeworkImage failed: ${res.status}`);
  const json = await res.json();
  // Convert relative URL to absolute so images work across different frontend ports
  if (json?.url && String(json.url).startsWith('/')) {
    json.url = `${API_BASE}${json.url}`;
  }
  return json;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file selected'));
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Unable to read file'));
    reader.readAsDataURL(file);
  });
}

export async function submitHomework(homeworkId, studentId, answers, attachmentUrls) {
  const list = Array.isArray(attachmentUrls)
    ? attachmentUrls.filter((u) => typeof u === 'string' && u.trim())
    : (typeof attachmentUrls === 'string' && attachmentUrls.trim() ? [attachmentUrls.trim()] : []);
  const headers = await authHeaders();
  const url = `${API_BASE}/homework/${encodeURIComponent(homeworkId)}/submit`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      studentId,
      answers,
      attachmentUrls: list,
      // Keep legacy field for older backend handlers.
      attachmentUrl: list[0] || null
    })
  });
  if (!res.ok) throw new Error(`submitHomework failed: ${res.status}`);
  const json = await res.json();
  if (json && json.success === false) {
    const msg = String(json.error || 'submitHomework failed');
    // Local dev resilience: backend mock has intermittently emitted null-map errors
    // while still processing side effects; do not hard-block student submit UX.
    if (msg.toLowerCase().includes("reading 'map'") || msg.toLowerCase().includes('reading "map"')) {
      return { success: true, attemptId: json.attemptId || null, grade: json.grade ?? null, warning: msg };
    }
    throw new Error(msg);
  }
  return json;
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

export async function getTeacherProfile() {
  const res = await fetch(`${API_BASE}/teacher/profile`, {
    headers: await authHeaders()
  });
  if (!res.ok) throw new Error(`getTeacherProfile failed: ${res.status}`);
  return res.json();
}

export async function getTeacherStudents(queryOrParams) {
  const params = typeof queryOrParams === 'string'
    ? { q: String(queryOrParams || '').trim() }
    : {
        q: String(queryOrParams?.q || '').trim(),
        className: String(queryOrParams?.className || '').trim()
      };
  const normalized = {};
  if (params.q) normalized.q = params.q;
  if (params.className && params.className.toLowerCase() !== 'all') normalized.className = params.className;

  const res = await fetch(withQuery('/teacher/students', normalized), {
    headers: await authHeaders()
  });
  if (!res.ok) throw new Error(`getTeacherStudents failed: ${res.status}`);
  const data = await res.json();
  return checkSuccess(data, 'getTeacherStudents');
}

export async function bulkUpdateTeacherStudentsClass(payload) {
  const headers = await authHeaders();
  const url = `${API_BASE}/teacher/students/bulk/class`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload || {})
  });
  if (!res.ok) throw new Error(`bulkUpdateTeacherStudentsClass failed: ${res.status}`);
  const data = await res.json();
  return checkSuccess(data, 'bulkUpdateTeacherStudentsClass');
}

export async function getTeacherStudentProgress(studentId) {
  const res = await fetch(`${API_BASE}/teacher/students/${encodeURIComponent(studentId)}/progress`, {
    headers: await authHeaders()
  });
  if (!res.ok) throw new Error(`getTeacherStudentProgress failed: ${res.status}`);
  const data = await res.json();
  return checkSuccess(data, 'getTeacherStudentProgress');
}

export async function getTeacherStudentDeliveryStatus(studentId) {
  const res = await fetch(`${API_BASE}/teacher/students/${encodeURIComponent(studentId)}/delivery-status`, {
    headers: await authHeaders()
  });
  if (!res.ok) throw new Error(`getTeacherStudentDeliveryStatus failed: ${res.status}`);
  const data = await res.json();
  return checkSuccess(data, 'getTeacherStudentDeliveryStatus');
}

export async function getTeacherStudentActivity(studentId) {
  const res = await fetch(`${API_BASE}/teacher/students/${encodeURIComponent(studentId)}/activity`, {
    headers: await authHeaders()
  });
  if (!res.ok) throw new Error(`getTeacherStudentActivity failed: ${res.status}`);
  const data = await res.json();
  return checkSuccess(data, 'getTeacherStudentActivity');
}

export async function getTeacherStudentHomework(studentId) {
  const res = await fetch(`${API_BASE}/teacher/students/${encodeURIComponent(studentId)}/homework`, {
    headers: await authHeaders()
  });
  if (!res.ok) throw new Error(`getTeacherStudentHomework failed: ${res.status}`);
  return res.json();
}

export async function getTeacherStudentTestAttempts(studentId) {
  const res = await fetch(`${API_BASE}/teacher/students/${encodeURIComponent(studentId)}/test-attempts`, {
    headers: await authHeaders()
  });
  if (!res.ok) throw new Error(`getTeacherStudentTestAttempts failed: ${res.status}`);
  return res.json();
}

export async function gradeTeacherHomework(hwId, payload) {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/teacher/homework/${encodeURIComponent(hwId)}/grade`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload || {})
  });
  return res.json();
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
  if (res.status === 401 || res.status === 403) notifyExpiredAuth();
  if (!res.ok) throw new Error(`assignTeacherHomework failed: ${res.status}`);
  const data = await res.json();
  return checkSuccess(data, 'assignTeacherHomework');
}

export async function updateTeacherHomework(homeworkId, payload) {
  const headers = await authHeaders();
  const url = `${API_BASE}/teacher/homework/${encodeURIComponent(homeworkId)}/update`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload || {})
  });
  if (res.status === 401 || res.status === 403) notifyExpiredAuth();
  if (!res.ok) throw new Error(`updateTeacherHomework failed: ${res.status}`);
  const data = await res.json();
  return checkSuccess(data, 'updateTeacherHomework');
}

export async function resyncTeacherHomework(assignments) {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/teacher/homework/resync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ assignments })
  });
  return res.json();
}

export async function getTeacherAssignedHomework() {
  const res = await fetch(`${API_BASE}/teacher/homework`, {
    headers: await authHeaders()
  });
  if (!res.ok) throw new Error(`getTeacherAssignedHomework failed: ${res.status}`);
  const data = await res.json();
  return checkSuccess(data, 'getTeacherAssignedHomework');
}

export async function getTeacherHomeworkAttempts(hwId) {
  const res = await fetch(`${API_BASE}/teacher/homework/${encodeURIComponent(hwId)}/attempts`, {
    headers: await authHeaders()
  });
  if (!res.ok) throw new Error(`getTeacherHomeworkAttempts failed: ${res.status}`);
  const data = await res.json();
  return checkSuccess(data, 'getTeacherHomeworkAttempts');
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
  bulkUpdateTeacherStudentsClass,
  getTeacherStudentProgress,
  getTeacherStudentDeliveryStatus,
  assignTeacherHomework,
  updateTeacherHomework,
  getTeacherAssignedHomework,
  getTeacherHomeworkAttempts,
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
