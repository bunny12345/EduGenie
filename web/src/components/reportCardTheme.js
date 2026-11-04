// Per-subject colour themes shared by the teacher's marks entry and the student's
// report card, so a subject looks the same on both sides.

const THEMES = [
  { match: ['math'], color: '#f59e0b', dark: '#b45309', soft: '#fff6dc', emoji: '📐' },
  { match: ['physics'], color: '#6366f1', dark: '#4338ca', soft: '#ececff', emoji: '⚛️' },
  { match: ['chemistry'], color: '#0ea5e9', dark: '#0369a1', soft: '#e1f4fd', emoji: '🧪' },
  { match: ['bio'], color: '#22c55e', dark: '#15803d', soft: '#e6fae9', emoji: '🌿' },
  { match: ['english', 'literature'], color: '#ec4899', dark: '#be185d', soft: '#fde8f3', emoji: '📖' },
  { match: ['hindi', 'sanskrit', 'urdu'], color: '#f97316', dark: '#c2410c', soft: '#ffeee0', emoji: '🪔' },
  { match: ['telugu', 'tamil', 'malayalam'], color: '#14b8a6', dark: '#0f766e', soft: '#dcf8f4', emoji: '🌺' },
  { match: ['kannada'], color: '#ef4444', dark: '#b91c1c', soft: '#ffe8e8', emoji: '🏵️' },
  { match: ['history'], color: '#a855f7', dark: '#7e22ce', soft: '#f3e8ff', emoji: '🏛️' },
  { match: ['geo'], color: '#06b6d4', dark: '#0e7490', soft: '#dcf7fc', emoji: '🗺️' },
  { match: ['social'], color: '#8b5cf6', dark: '#6d28d9', soft: '#efe9ff', emoji: '🌍' },
  { match: ['computer', 'coding', 'it'], color: '#3b82f6', dark: '#1d4ed8', soft: '#e3eeff', emoji: '💻' },
  { match: ['science', 'evs', 'environment'], color: '#10b981', dark: '#047857', soft: '#e0faf0', emoji: '🔬' },
  { match: ['draw', 'art'], color: '#f43f5e', dark: '#be123c', soft: '#ffe6eb', emoji: '🎨' },
  { match: ['music', 'rhyme'], color: '#d946ef', dark: '#a21caf', soft: '#fbe7ff', emoji: '🎵' },
  { match: ['story'], color: '#eab308', dark: '#a16207', soft: '#fdf6d0', emoji: '📚' }
];

const FALLBACKS = [
  { color: '#5b47ff', dark: '#3b2fc9', soft: '#eeeaff' },
  { color: '#0891b2', dark: '#155e75', soft: '#dff6fb' },
  { color: '#e11d48', dark: '#9f1239', soft: '#ffe4ea' },
  { color: '#65a30d', dark: '#3f6212', soft: '#ecfad1' }
];

export function subjectTheme(subject) {
  const s = String(subject || '').toLowerCase();
  const hit = THEMES.find((t) => t.match.some((m) => (m === 'it' ? /\bit\b/.test(s) : s.includes(m))));
  const base = hit || {
    ...FALLBACKS[[...s].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % FALLBACKS.length],
    emoji: '⭐'
  };
  return {
    ...base,
    gradient: `linear-gradient(135deg, ${base.color}, ${base.dark})`
  };
}

export function gradeColor(grade) {
  switch (grade) {
    case 'A+': return '#16a34a';
    case 'A': return '#22c55e';
    case 'B+': return '#0ea5e9';
    case 'B': return '#3b82f6';
    case 'C': return '#f59e0b';
    case 'D': return '#f97316';
    default: return '#ef4444';
  }
}

export function formatMarks(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
