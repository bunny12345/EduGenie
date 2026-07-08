// Minimal API client for the EduGenie backend
// If REACT_APP_USE_PROXY=1 prefer relative paths so CRA proxy (package.json) forwards to mock.
import supabase from './supabaseClient';

const useProxy = ['1', 'true', 'yes', 'on'].includes(String(process.env.REACT_APP_USE_PROXY || '').toLowerCase());
const API_BASE = useProxy ? '' : (process.env.REACT_APP_API_URL || (process.env.REACT_APP_USE_MOCK ? 'http://localhost:4000' : 'http://localhost:3000'));
let runtimeDevToken = '';

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
  return getJson(url);
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
  return getJson(url);
}

export async function saveStudent(payload) {
  const url = `${API_BASE}/chat/student`;
  const headers = await authHeaders();
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
  return res.json();
}

export async function getDashboard(studentId) {
  const url = `${API_BASE}/dashboard?studentId=${encodeURIComponent(studentId)}`;
  return getJson(url);
}

export async function getHomework(studentId) {
  const url = `${API_BASE}/homework?studentId=${encodeURIComponent(studentId)}`;
  return getJson(url);
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
  return getJson(url);
}

export async function getProgress(studentId, period = 'week') {
  const url = `${API_BASE}/progress?studentId=${encodeURIComponent(studentId)}&period=${encodeURIComponent(period)}`;
  return getJson(url);
}

export async function getCalendar(studentId) {
  const url = `${API_BASE}/calendar?studentId=${encodeURIComponent(studentId)}`;
  return getJson(url);
}

export async function getRewards(studentId) {
  const url = `${API_BASE}/rewards?studentId=${encodeURIComponent(studentId)}`;
  return getJson(url);
}

export async function getTests(studentId, filter = 'upcoming') {
  const url = `${API_BASE}/tests?studentId=${encodeURIComponent(studentId)}&filter=${encodeURIComponent(filter)}`;
  return getJson(url);
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
  return getJson(url);
}

export async function getLibrary(topic, level, page = 1) {
  const params = new URLSearchParams();
  if (topic) params.set('topic', topic);
  if (level) params.set('level', level);
  params.set('page', String(page));
  const url = `${API_BASE}/library?${params.toString()}`;
  return getJson(url);
}

export async function getLibraryResource(id) {
  const url = `${API_BASE}/library/${encodeURIComponent(id)}`;
  return getJson(url);
}

export async function getSettings(studentId) {
  const url = `${API_BASE}/settings?studentId=${encodeURIComponent(studentId)}`;
  return getJson(url);
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

export async function getTeacherDashboard() {
  return getJson(`${API_BASE}/teacher/dashboard`);
}

export async function getTeacherStudents(query) {
  const q = String(query || '').trim();
  const url = q
    ? `${API_BASE}/teacher/students?q=${encodeURIComponent(q)}`
    : `${API_BASE}/teacher/students`;
  return getJson(url);
}

export async function getTeacherStudentProgress(studentId) {
  return getJson(`${API_BASE}/teacher/students/${encodeURIComponent(studentId)}/progress`);
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

export async function listTeacherStudentInvites() {
  return getJson(`${API_BASE}/teacher/invites/student`);
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
  return getJson(`${API_BASE}/school/dashboard`);
}

export async function schoolTeachers() {
  return getJson(`${API_BASE}/school/teachers`);
}

export async function schoolInvites() {
  return getJson(`${API_BASE}/school/invites`);
}

export async function schoolStudents() {
  return getJson(`${API_BASE}/school/students`);
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
  return getJson(`${API_BASE}/teacher/announcements`);
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
  getCalendar,
  getRewards,
  getChatHistory,
  getTests,
  startTest,
  submitTestAttempt,
  getTestAttempt,
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
