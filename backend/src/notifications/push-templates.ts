export type PushType =
  | 'evening_plan'
  | 'night_recap'
  | 'test_tomorrow'
  | 'new_homework'
  | 'new_test'
  | 'announcement'
  | 'test';

export type PushRoute = 'homework' | 'tests' | 'ai_tutor' | 'announcements' | 'progress' | 'home';

export type PushMessage = {
  type: PushType;
  title: string;
  body: string;
  route: PushRoute;
  data?: Record<string, string>;
};

export type DigestHomework = {
  title: string;
  subject: string;
  dueToday: boolean;
  dueTomorrow: boolean;
  overdue: boolean;
};

export type DigestTest = {
  title: string;
  subject: string;
  opensAtLabel: string;
  closesAtLabel: string;
  durationMinutes: number;
  closesTomorrow: boolean;
};

export type DigestActivity = {
  homeworkSubmitted: number;
  testsCompleted: number;
  bestTestScore: number | null;
  tutorQuestions: number;
  practiceSessions: number;
  checkedIn: boolean;
};

export type StudentDigest = {
  firstName: string;
  pendingHomework: DigestHomework[];
  testsTomorrow: DigestTest[];
  activity: DigestActivity;
  streakDays: number;
  revisionSubject: string | null;
};

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

function uniqueSubjects(items: { subject: string }[], max = 3) {
  const subjects = [...new Set(items.map((i) => i.subject).filter(Boolean))];
  if (subjects.length <= max) return subjects.join(', ');
  return `${subjects.slice(0, max).join(', ')} +${subjects.length - max}`;
}

function nameOf(digest: StudentDigest) {
  return digest.firstName || 'Champ';
}

export function hasActivity(activity: DigestActivity) {
  return activity.homeworkSubmitted + activity.testsCompleted + activity.tutorQuestions + activity.practiceSessions > 0
    || activity.checkedIn;
}

/** 6:30 PM: today's plan — homework to finish, or a revision nudge with Sam. */
export function eveningPlanMessage(digest: StudentDigest): PushMessage {
  const name = nameOf(digest);
  const pending = digest.pendingHomework;
  const streak = digest.streakDays;
  if (!pending.length) {
    const subject = digest.revisionSubject ? `${digest.revisionSubject} ` : '';
    return {
      type: 'evening_plan',
      route: 'ai_tutor',
      title: `🎉 No homework today, ${name}!`,
      body: `Perfect time for a 15-min ${subject}revision with Sam 🤖📖 ${streak > 0 ? `Keep your 🔥 ${streak}-day streak going!` : 'Start a fresh 🔥 streak tonight!'}`
    };
  }
  const overdue = pending.filter((h) => h.overdue);
  const today = pending.filter((h) => h.dueToday && !h.overdue);
  const tomorrow = pending.filter((h) => h.dueTomorrow);
  const later = pending.length - overdue.length - today.length - tomorrow.length;
  const pieces = [
    overdue.length ? `⚠️ ${overdue.length} overdue (${uniqueSubjects(overdue)})` : '',
    today.length ? `⏰ ${today.length} due today (${uniqueSubjects(today)})` : '',
    tomorrow.length ? `📅 ${tomorrow.length} due tomorrow (${uniqueSubjects(tomorrow)})` : '',
    later > 0 ? `🗓️ ${later} coming up` : ''
  ].filter(Boolean);
  return {
    type: 'evening_plan',
    route: 'homework',
    title: `📚 ${name}, ${plural(pending.length, 'homework task')} to finish`,
    body: `${pieces.join(' · ')}. ${streak > 0 ? `Finish strong & keep your 🔥 ${streak}-day streak! 💪` : `Let's knock them out tonight 💪`}`
  };
}

/** 6:30 PM (separate push): mock tests opening or closing tomorrow. */
export function testTomorrowMessage(digest: StudentDigest): PushMessage | null {
  const tests = digest.testsTomorrow;
  if (!tests.length) return null;
  if (tests.length === 1) {
    const t = tests[0];
    const when = t.closesTomorrow
      ? `closes tomorrow${t.closesAtLabel ? ` at ${t.closesAtLabel}` : ''} — finish it before the deadline ⏳`
      : `opens tomorrow${t.opensAtLabel ? ` at ${t.opensAtLabel}` : ''} · ⏱️ ${t.durationMinutes} min. A quick revision tonight = a better score 💯`;
    return {
      type: 'test_tomorrow',
      route: 'tests',
      data: { subject: t.subject },
      title: `📝 Mock test tomorrow: ${t.subject}`,
      body: `“${t.title}” ${when}`
    };
  }
  return {
    type: 'test_tomorrow',
    route: 'tests',
    data: { subject: tests[0].subject },
    title: `📝 ${tests.length} mock tests tomorrow`,
    body: `${uniqueSubjects(tests, 4)} — revise tonight with Sam 🤖 and sleep early 😴 You've got this 💪`
  };
}

function activityParts(a: DigestActivity) {
  return [
    a.homeworkSubmitted ? `📚 ${plural(a.homeworkSubmitted, 'homework', 'homework')} submitted` : '',
    a.testsCompleted ? `📝 ${plural(a.testsCompleted, 'mock test')} done${a.bestTestScore !== null ? ` (${a.bestTestScore}%)` : ''}` : '',
    a.tutorQuestions ? `🤖 ${plural(a.tutorQuestions, 'question')} to Sam` : '',
    a.practiceSessions ? `🌳 ${plural(a.practiceSessions, 'practice session')}` : '',
    a.checkedIn ? '🎯 daily check-in' : ''
  ].filter(Boolean);
}

/** 9:00 PM: what the student achieved today, with praise or a gentle nudge. */
export function nightRecapMessage(digest: StudentDigest): PushMessage {
  const name = nameOf(digest);
  const remaining = digest.pendingHomework.filter((h) => h.dueToday || h.overdue).length;
  const streak = digest.streakDays;
  if (hasActivity(digest.activity)) {
    const parts = activityParts(digest.activity).join(' · ');
    if (!remaining) {
      return {
        type: 'night_recap',
        route: 'progress',
        title: `🎉 Great job today, ${name}!`,
        body: `${parts}. ${streak > 1 ? `🔥 ${streak}-day streak — keep going! 🚀` : 'Keep going — see you tomorrow! 🚀'}`
      };
    }
    return {
      type: 'night_recap',
      route: 'homework',
      title: `👏 Nice progress today, ${name}!`,
      body: `${parts}. ${plural(remaining, 'homework task')} still due — one last push or plan it for the morning ⏰💪`
    };
  }
  if (remaining) {
    return {
      type: 'night_recap',
      route: 'homework',
      title: `🌙 ${name}, there's still time for a quick win`,
      body: `${plural(remaining, 'homework task')} waiting ⏳ Just 10 minutes tonight ${streak > 0 ? `keeps your 🔥 ${streak}-day streak alive` : 'starts a brand-new 🔥 streak'}!`
    };
  }
  return {
    type: 'night_recap',
    route: 'ai_tutor',
    title: `🌙 Hey ${name}, 5 minutes before bed?`,
    body: `Ask Sam 🤖 one quick question or revise a topic from today 📖 Small steps, big wins ✨`
  };
}

const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value);

export function newHomeworkMessage(input: { title: string; subject: string; dueLabel: string; count: number }): PushMessage {
  const subject = input.subject || 'General';
  if (input.count > 1) {
    return {
      type: 'new_homework',
      route: 'homework',
      title: `📚 ${input.count} new homework tasks`,
      body: `Your teacher just assigned new ${subject} homework. Tap to plan your evening ✏️`
    };
  }
  return {
    type: 'new_homework',
    route: 'homework',
    title: `📚 New ${subject} homework`,
    body: `“${clip(input.title || 'Homework', 80)}”${input.dueLabel ? ` — due ${input.dueLabel}` : ''}. Tap to get started ✏️`
  };
}

export function newTestMessage(input: { title: string; subject: string; opensLabel: string; durationMinutes: number }): PushMessage {
  const subject = input.subject || 'General';
  return {
    type: 'new_test',
    route: 'tests',
    data: { subject },
    title: `🧪 New mock test: ${subject}`,
    body: `“${clip(input.title || 'Mock test', 80)}”${input.opensLabel ? ` opens ${input.opensLabel}` : ''} · ⏱️ ${input.durationMinutes} min. Revise with Sam 🤖 to ace it 💡`
  };
}

export function announcementMessage(input: { title: string; message: string }): PushMessage {
  const body = String(input.message || '').replace(/\s+/g, ' ').trim();
  return {
    type: 'announcement',
    route: 'announcements',
    title: `📢 ${clip(String(input.title || 'School announcement').trim(), 60)}`,
    body: body ? clip(body, 180) : 'Tap to read the latest update from your school 🏫'
  };
}
