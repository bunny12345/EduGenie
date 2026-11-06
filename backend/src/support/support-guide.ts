export function redactSupportText(text: string) {
  return text
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[token removed]')
    .replace(/\b(?:sk|sb_secret|sb_publishable)[-_][A-Za-z0-9_-]{12,}\b/g, '[key removed]')
    .replace(/\b(password|passcode|api[_ -]?key|secret|authorization)\s*[:=]\s*\S+/gi, '$1: [removed]');
}

const guides = [
  { words: /\b(homework|assignment|submit|submission|resubmit)\b/i, reply: 'Open Homework from Academics, choose your subject and assignment, then follow its submission instructions. You can attach work if that assignment allows it. Resubmission is only available within the allowed window. If submission fails, keep a copy of your work and report the issue with the assignment name and what happened.' },
  { words: /\b(sam|tutor|lesson|pdf|subject)\b/i, reply: 'For quick lesson questions, tap the blue Sam bubble on Home. For a specific subject or lesson, open AI Tutor from Academics and select it there. Sam teaches from materials uploaded for your class. Missing materials or subjects need your teacher or school administrator to check their uploads and class assignments.' },
  { words: /\b(microphone|mic|voice|audio|sound|hear|speaking)\b/i, reply: 'For voice questions, allow microphone access when your browser or app asks, then use the mic button. Check device volume and Sam’s mute button if you cannot hear replies. If you denied microphone access, enable it in your browser/site or device app permissions. You can always type instead. Never send passwords or permission screenshots containing private information.' },
  { words: /\b(password|login|log in|sign in|account|credentials)\b/i, reply: 'Use Student Login with the login ID and password provided by your school. The eye button lets you check a password where available. If you have forgotten your password or your account is unavailable, contact your teacher or school administrator; support cannot ask for or reveal your password. Do not share it in this chat.' },
  { words: /\b(test|quiz|exam|mock)\b/i, reply: 'Open Mock Tests from Academics, choose an available test and read its instructions before starting. Submit your answers using the test’s controls. Availability and deadlines are set by your teacher. If a test freezes or a submission does not appear, report its name and what you saw—do not send test answers.' },
  { words: /\b(progress|report card|score|marks)\b/i, reply: 'Open Progress for your learning report or Report Card for school marks. They show different kinds of progress. If marks or class details look incorrect, ask your teacher or school administrator to check them. You can report a display issue here, but the support bot cannot change marks.' },
  { words: /\b(streak|reward|coin|check.in)\b/i, reply: 'Open Rewards to check available rewards and check in. Streaks count learning activity or reward check-ins; signing in alone does not count. If a completed activity or reward is not reflected, tell the technician which activity and when it happened.' },
  { words: /\b(game|flashcard|memory maze|quiz rush)\b/i, reply: 'Open Games from Academics and select an available game. Follow the instructions shown inside it. If a game is not responding, return to the game hub and reopen it; save any other work first. Report the game name and the steps that caused the problem if it continues.' },
  { words: /\b(calendar|library|orchard|navigation|navigate|where|find)\b/i, reply: 'Home’s Academics panel links to AI Tutor, Homework, My Orchard, Mock Tests, Progress, Games, Calendar, Rewards, Library and Settings where available. On the website you can also use the sidebar; the mobile app uses bottom navigation. Some School Services are still previews and may not support actions yet.' },
  { words: /\b(slow|blank|freeze|frozen|crash|bug|glitch|issue|error|broken|not working)\b/i, reply: 'Keep a copy of any unsent work first. Check your connection and reopen the affected page or app. Avoid repeatedly submitting the same work. If the problem continues, use Report an issue and include the page, what you tried, and what happened instead. Do not paste passwords, verification codes or private student records.' },
];

export function answerSupportQuestion(text: string) {
  if (/\b(secret|service.?role|source code|database|schema|server|api key|jwt|prompt|system instruction|credential)\b/i.test(text)) {
    return { reply: 'I can help you use AcademiX, but I cannot provide internal systems, code, keys, credentials or private information. Describe the feature you are trying to use, without sharing any secrets.', needsTechnician: true, suggestions: ['How do I submit homework?', 'How do I use Sam?'] };
  }
  const guide = guides.find((item) => item.words.test(text));
  if (guide) return { reply: guide.reply, needsTechnician: false, suggestions: ['Report an issue', 'Connect to a technician'] };
  if (/^(hi|hello|hey|thanks|thank you)[!. ]*$/i.test(text)) {
    return { reply: 'Hi! I can help with using AcademiX on the website or app. What are you trying to do? Please do not share passwords or private records.', needsTechnician: false, suggestions: ['How do I submit homework?', 'How do I use Sam?', 'My microphone is not working'] };
  }
  return { reply: 'I do not have a verified guide for that question. I can help with AcademiX features, but I will not guess. If this is an app or website issue, choose Connect to a technician and explain it so a person can help.', needsTechnician: true, suggestions: ['Connect to a technician', 'Report an issue'] };
}
