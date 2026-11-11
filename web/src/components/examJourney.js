const subjectKey = (name) => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();

export function examPercentage(marks, maximum) {
  if (marks == null || maximum == null || String(marks).trim() === '' || String(maximum).trim() === '') {
    throw new Error('A released report card has missing marks. Please ask your teacher to check it.');
  }
  const value = Number(marks);
  const max = Number(maximum);
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || value < 0 || value > max) {
    throw new Error('A released report card has invalid marks. Please ask your teacher to check it.');
  }
  return value / max * 100;
}

export function examJourney(cards) {
  // The endpoint is newest-created first. Reverse it for legacy cards without
  // creation dates; editing marks must not move an exam along the timeline.
  const points = [...cards].reverse().map((card, index) => {
    if (!card.examId || !Array.isArray(card.subjects) || !card.subjects.length) {
      throw new Error('A released report card is incomplete. Please ask your teacher to check it.');
    }
    const subjects = card.subjects.map((row) => ({
      ...row,
      key: subjectKey(row.subject),
      percentage: examPercentage(row.marks, row.maxMarks),
    }));
    const total = subjects.reduce((sum, row) => sum + Number(row.marks), 0);
    const maxTotal = subjects.reduce((sum, row) => sum + Number(row.maxMarks), 0);
    return { ...card, subjects, total, maxTotal, percentage: examPercentage(total, maxTotal), index };
  });
  if (points.every((card) => Number.isFinite(Date.parse(card.createdAt)))) {
    points.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.index - b.index);
  }
  return points;
}

export function examValue(card, subject) {
  return subject ? card.subjects.find((row) => row.key === subject)?.percentage ?? null : card.percentage;
}

export function examChange(current, previous) {
  return current == null || previous == null ? null : Math.round((current - previous) * 100) / 100;
}
