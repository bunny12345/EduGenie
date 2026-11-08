import { redactSupportText } from './support-guide';

export const VISITOR_INTRO = 'Welcome to AcademiX! Give every student a personal AI tutor for learning beyond the classroom. Sam helps them understand lessons, practise for exams and work through homework, while learning reports show how they grow. Explore the features below, or talk to our admin about bringing AcademiX to your school.';

const guides = [
  { words: /\b(brand|branding|logos?|school name|white.?label|promot)\b/i, reply: 'Make the experience your school’s own. We offer your school name and logo branding for the website, app and AI tutor experience as part of school onboarding. Tell our admin how you want your school presented and we’ll discuss the setup with you.' },
  { words: /\b(custom|customise|customize|develop|demands?|new features?|tailor|bespoke)\b/i, reply: 'Your school can request the features it needs. We can develop additional website and app features on demand, and tailor the school experience to your requirements. Talk to our admin to agree the scope, timeline and cost before development starts.' },
  { words: /\b(register|registration|contact|admin|demo|pricing|price|cost|buy|subscribe|subscription|sales|trial)\b/i, reply: 'Choose “Talk to admin” to discuss a demo, pricing, school registration or a tailored setup. Share your name, school and work email, verify the email code, then send your enquiry. Our admin receives an email notification and can reply in this chat. Registration is completed by the platform owner after discussing your school’s needs; this bot cannot create school accounts or promise prices or response times.' },
  { words: /\b(progress|graphs?|reports?|report cards?|track|performance|marks)\b/i, reply: 'Learning reports bring together a student’s activity into a learning score, skill breakdown, subject growth and daily/monthly graphs. Students can follow their own progress; teachers can review their assigned students, and school administrators can search across classes on the website. School exam report cards show released marks separately from the learning score.' },
  { words: /\b(homework|exams?|tests?|practice|practise|revision|quizzes)\b/i, reply: 'Students can use Sam to understand homework and practise concepts, not simply replace their own work. Homework submission, mock tests, quizzes and revision games help them prepare for exams after school. Teachers manage tasks and tests, while students see their learning progress as they practise.' },
  { words: /\b(tutor|sam|ai|personal|learn|teaching)\b/i, reply: 'AcademiX’s heart is Sam, a personal AI tutor that interacts with students beyond school hours. Students can ask for explanations, learn from their assigned lessons, practise with quizzes and use supported voice features. Sam supports learning alongside teachers. ' },
  { words: /\b(app|mobile|flutter|website|web|devices?)\b/i, reply: 'AcademiX offers a website and mobile app connected to the same school platform. Students can learn with the AI tutor, complete tasks and check progress; teachers have their own tools too. Available screens and features can differ by device and rollout. Talk to admin about the mobile options and setup your school needs.' },
  { words: /\b(teachers?|school admin|principal|manage|curriculum)\b/i, reply: 'Teachers can work with their assigned classes, manage tests and review learning. School administrators use the website to register teachers and students, assign classes, upload lesson PDFs and review school-wide student progress and report cards. Your school’s curriculum helps guide lesson-based tutoring.' },
  { words: /\b(features?|games?|orchard|rewards|calendar|library|what|about|hello|hi|start|introduc)\b/i, reply: 'Beyond personal AI tutoring, AcademiX brings homework, mock tests, revision games, My Orchard, progress graphs, exam report cards, rewards, calendar and library features together. There are separate student, teacher and school-admin experiences. Want to see how it fits your school? Choose “Talk to admin” to discuss a demonstration and school branding.' },
];

export function answerVisitorQuestion(value: string) {
  const text = redactSupportText(value);
  if (/\b(passwords?|secrets?|tokens?|api.?keys?|credentials?|database|source code|system prompt|server|sql|other.*students?|private records?)\b/i.test(text)) {
    return { reply: 'I can explain public features and school onboarding, but I cannot share technical internals, passwords, secrets or private school records. Please do not send credentials or student information. Choose “Talk to admin” for a school enquiry.', handoff: true };
  }
  const guide = guides.find((item) => item.words.test(text));
  return guide ? { reply: guide.reply, handoff: false } : {
    reply: 'I can help you explore AcademiX’s AI tutoring, school features, branding and registration. I do not want to guess about something outside that guide. Choose “Talk to admin” for an accurate answer about your school’s needs.',
    handoff: true
  };
}
