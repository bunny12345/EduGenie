// Minimal API client for the EduGenie backend
// If REACT_APP_USE_PROXY=1 prefer relative paths so CRA proxy (package.json) forwards to mock.
const useProxy = !!process.env.REACT_APP_USE_PROXY;
const API_BASE = useProxy ? '' : (process.env.REACT_APP_API_URL || (process.env.REACT_APP_USE_MOCK ? 'http://localhost:4000' : 'http://localhost:3000'));

export async function sendChat(studentId, message) {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId, message })
  });
  return res.json();
}

export async function listMemories(studentId) {
  // Backend exposes GET /chat/memories which returns { memories: [...] }
  const url = `${API_BASE}/chat/memories?studentId=${encodeURIComponent(studentId)}`;
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
  const data = await res.json();
  // Normalize common shapes: { data: [...] } | { memories: [...] } | raw array
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.data)) return data.data;
  if (data && Array.isArray(data.memories)) return data.memories;
  return [];
}

export async function addMemory(studentId, value) {
  const res = await fetch(`${API_BASE}/chat/memory`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId, value })
  });
  return res.json();
}

export async function getStudent(studentId) {
  const url = `${API_BASE}/chat/student?studentId=${encodeURIComponent(studentId)}`;
  const res = await fetch(url);
  return res.json();
}

export async function saveStudent(payload) {
  const url = `${API_BASE}/chat/student`;
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  return res.json();
}

const api = { sendChat, listMemories, addMemory, getStudent, saveStudent };
export default api;
