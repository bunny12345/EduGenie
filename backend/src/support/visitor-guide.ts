import { redactSupportText } from './support-guide';

export const VISITOR_INTRO = 'Welcome to AcademiX! Give every student a personal AI tutor for learning beyond the classroom. Sam helps them understand lessons, practise for exams and work through homework, while learning reports show how they grow. Explore the features below, or talk to our admin about bringing AcademiX to your school.';

const guides = [
  { words: /\b(brand|branding|logos?|school name|white.?label|promot)\b/i, reply: 'Make the experience your school’s own. We offer your school name and logo branding for the website, app and AI tutor experience as part of school onboarding. Tell our admin how you want your school presented and we’ll discuss the setup with you.' },
  { words: /\b(custom|customise|customize|develop|demands?|new features?|tailor|bespoke)\b/i, reply: 'Your school can request the features it needs. We can develop additional website and app features on demand, and tailor the school experience to your requirements. Talk to our admin to agree the scope, timeline and cost before development starts.' },
  { words: /\b(register|registration|contact|admin|demo|pricing|price|cost|buy|subscribe|subscription|sales|trial)\b/i, reply: 'Choose “Talk to admin” to discuss a demo, pricing, school registration or a tailored setup. Share your name, school and work email, verify the email code, then send your enquiry. Our admin receives an email notification and can reply in this chat. Registration is completed by the platform owner after discussing your school’s needs; this bot cannot create school accounts or promise prices or response times.' },
  { words: /\b(progress|graphs?|reports?|report cards?|track|performance|marks)\b/i, reply: 'Learning reports bring together a student’s activity into a learning score, skill breakdown, subject growth and daily/monthly graphs. Students can follow their own progress; teachers can review their assigned students, and school administrators can search across classes on the website. School exam report cards show released marks separately from the learning score.' },
  { words: /\b(homework|exams?|tests?|practice|practise|revision|quizzes)\b/i, reply: 'Students can use Sam to understand homework and practise concepts, not simply replace their own work. Homework submission, mock tests, quizzes and revision games help them prepare for exams after school. Teachers manage tasks and tests, while students see their learning progress as they practise.' },
  { words: /\b(tutor|sam|ai|personal|learn|teaching)\b/i, reply: 'AcademiX’s heart is Sam, a personal AI tutor that interacts with students beyond school hours. Students can ask for explanations, learn from their assigned lessons, practise with quizzes and use supported voice features. Sam supports learning alongside teachers. ' },
  { words: /\b(games?|rewards?|calendar|library)\b/i, reply: 'Students have revision games, rewards, a calendar and a library alongside their learning tools. Games include Flashcards, Quiz Rush and Memory Maze. What appears depends on the student’s class and the content available to them; a library or calendar can be empty until school content is available. These features do not imply that demo School Services such as fee payment are active.' },
  { words: /\b(teachers?|school admin|principal|manage|curriculum)\b/i, reply: 'Teachers can work with their assigned classes, manage tests and review learning. School administrators use the website to register teachers and students, assign classes, upload lesson PDFs and review school-wide student progress and report cards. Your school’s curriculum helps guide lesson-based tutoring.' },
  { generic: true, words: /\b(app|mobile|flutter|website|web|devices?)\b/i, reply: 'AcademiX offers a website and mobile app connected to the same school platform. Students can learn with the AI tutor, complete tasks and check progress; teachers have their own tools too. Available screens and features can differ by device and rollout. Talk to admin about the mobile options and setup your school needs.' },
  { generic: true, words: /\b(features?|games?|orchard|rewards|calendar|library|what|about|hello|hi|start|introduc)\b/i, reply: 'Beyond personal AI tutoring, AcademiX brings homework, mock tests, revision games, My Orchard, progress graphs, exam report cards, rewards, calendar and library features together. There are separate student, teacher and school-admin experiences. Want to see how it fits your school? Choose “Talk to admin” to discuss a demonstration and school branding.' },
];

const scenarios = [
  {
    topic: /\b(fees?|payments?|pay(?:ing)?|paid|upi|receipts?|refunds?|transactions?)\b/i,
    reply: 'School fee payment is not currently a live AcademiX feature. The Fee tile is a demo/customization preview, not a working payment or receipt screen. For example, a parent cannot pay tuition or download a payment receipt through that preview. Use your school’s confirmed payment process; do not send money, card details, PINs or verification codes here. Choose “Talk to admin” to discuss a fee-payment integration, its scope and cost; availability is not promised.',
    handoff: true,
  },
  {
    topic: /\b(attendance|transport|bus(?:es)?|gps|medical|health records?)\b/i,
    reply: 'Attendance, Transport and Medical Info tiles are currently school-service demo previews, not live attendance registers, bus tracking or medical-record workflows. A visible tile does not mean that action is enabled. Ask your school for its current process, or choose “Talk to admin” to confirm whether your requested service can be developed. Do not send student locations or medical details here.',
    handoff: true,
  },
  {
    topic: /\b(parents?|guardians?)\b/i,
    when: /\b(login|log in|account|access|portal)\b/i,
    reply: 'I cannot confirm a separate parent login or parent-specific controls as an available feature. The current platform has student, teacher and school-admin experiences. Do not assume a parent can pay fees or access a child’s private records through this public chat. Choose “Talk to admin” to discuss parent access requirements and confirm the supported setup for your school.',
    handoff: true,
  },
  {
    topic: /\b(login|log in|sign in|passwords?|forgot|locked|account access)\b/i,
    reply: 'If you cannot sign in, first select the correct School, Teacher or Student login. Students and teachers should use the login details supplied by their school and contact the school administrator for a forgotten password or unavailable account. School administrators should contact the platform admin for access help. This public bot cannot check an account, reset a password or disclose one. Never send passwords or verification codes here.',
    handoff: true,
  },
  {
    topic: /\b(offline|internet|connection|network|wi-?fi)\b/i,
    reply: 'An internet connection is needed for live AI replies, synchronizing homework and retrieving updated school information. Do not rely on an offline tutoring or offline submission mode. For example, if the connection drops while submitting homework, keep a copy of the work, reconnect and check whether it already appears as submitted before retrying. This bot cannot verify a submission; ask your teacher if the status is unclear.',
  },
  {
    topic: /\b(school admin|school administrator|principal)\b/i,
    when: /\b(app|mobile|phone)\b/i,
    reply: 'School administrators should use the website for registration, curriculum and school-management tasks. The School Admin mobile portal is not currently a full working management portal. Do not assume every website action is available on a phone app. Choose “Talk to admin” to confirm the mobile setup needed by your school before onboarding.',
    handoff: true,
  },
  {
    topic: /\b(progress|graphs?|reports?|marks|scores?|performance)\b/i,
    when: /\b(different|same|why|wrong|calculate|calculat|include|based|homework|games?|exam|test|improv|low|zero|no|not)\b/i,
    reply: 'The learning graph is not just game points or school exam marks. It combines understanding, practice, tree growth, homework and tests/mock tests for each subject. Submitted homework can contribute activity; teacher grading contributes performance when available. School exam report cards show released marks separately. If a graph or mark looks wrong, ask the teacher or school administrator to check the relevant activity or released report; this public bot cannot inspect or change a student’s results.',
  },
  {
    topic: /\b(homework|assignments?|submi(?:t|ssion)|resubmit)\b/i,
    when: /\b(wrong|mistake|attach|replace|again|twice|failed|fail|missing|disappear|not|cannot|can.t|unable|how|what if|already)\b/i,
    reply: 'If a student uploads the wrong homework or a submission seems to fail, open that assignment and check its saved status first. Keep a copy of the work and use resubmission only if the assignment still offers it within the allowed window. If that option is unavailable or the deadline has passed, contact the teacher rather than repeatedly submitting. Sam can explain the lesson, but this public bot cannot submit, reopen or grade homework.',
  },
  {
    topic: /\b(tests?|mock|exams?|quizzes)\b/i,
    when: /\b(fail|froze|freeze|closed|lost|again|twice|not|cannot|can.t|unable|interrupt|deadline|time|what if)\b/i,
    reply: 'If a test closes, freezes or a submission is uncertain, reopen its page and check the displayed attempt status before starting again. Test windows and deadlines are set by the teacher; a new attempt or reopening is not guaranteed. Contact the teacher with the test name and what happened, without sending answers. This public bot cannot restore an attempt, extend its time or change a score.',
  },
  {
    topic: /\b(orchard|trees?|fruits?|acorns?)\b/i,
    reply: 'My Orchard represents learning by subject and lesson. Completing learning milestones grows a lesson from a seed through the stages; retention checks and the required understanding are needed for full mastery. Simply opening the page or playing one game does not automatically earn a mastery fruit. If a lesson or subject is missing, ask your teacher to check the class assignment and uploaded materials. This bot cannot award fruit or change growth.',
  },
  {
    topic: /\b(lessons?|pdfs?|subjects?|curriculum|materials?)\b/i,
    when: /\b(upload|own|our|school|missing|not|no|wrong|different|class)\b/i,
    reply: 'Your school can upload lesson PDFs for its classes so lesson-based tutoring follows the assigned materials. If a student cannot see a lesson, check that they are in the correct class and ask the teacher or school administrator to confirm the upload and class visibility. This public bot cannot upload a document or inspect a school’s files. Choose “Talk to admin” to discuss your curriculum needs before onboarding.',
  },
  {
    topic: /\b(sam|tutor|ai|answers?|explanations?)\b/i,
    when: /\b(wrong|incorrect|accurate|accuracy|always|guarantee|replace|instead of|without.*teacher)\b/i,
    reply: 'Sam supports teachers; it does not replace them or guarantee every answer is correct. If an explanation seems wrong, check the selected subject and lesson, ask Sam to explain the specific step again, and confirm it with your teacher before relying on it. Lesson-based tutoring is guided by the assigned materials. This public feature guide cannot inspect a private chat or solve a lesson question.',
  },
  {
    topic: /\b(slow|blank|frozen|crash|not working|errors?)\b/i,
    reply: 'Keep a copy of any unsent work, check the connection and reopen the affected screen. If a save or submission was interrupted, check its status before trying again to avoid duplicates. If the problem continues, use the signed-in Help Assistant to report the feature, steps and what happened, or choose “Talk to admin” if you cannot sign in. Do not include passwords, verification codes or private student records.',
    handoff: true,
  },
];

function scenarioFor(text: string) {
  return scenarios.find((item) => item.topic.test(text) && (!item.when || item.when.test(text)));
}

export function answerVisitorQuestion(value: string, previousQuestions: string[] = []) {
  const text = redactSupportText(value);
  if (/\b(secrets?|tokens?|api.?keys?|credentials?|database|source code|system prompt|server|sql|other.*students?|private records?)\b/i.test(text)
    || /\b(?:show|tell|give|reveal|share|list|what is|what are)\b.{0,50}\bpasswords?\b/i.test(text)) {
    return { reply: 'I can explain public features and school onboarding, but I cannot share technical internals, passwords, secrets or private school records. Please do not send credentials or student information. Choose “Talk to admin” for a school enquiry.', handoff: true };
  }
  const scenario = scenarioFor(text);
  if (scenario) return { reply: scenario.reply, handoff: scenario.handoff || false };
  const hasTopic = scenarios.some((item) => item.topic.test(text))
    || guides.some((item) => !item.generic && item.words.test(text));
  if (!hasTopic && text.length <= 160 && /^(?:(?:and|but|so|ok(?:ay)?)[, ]+)?(?:it\b|that\b|does it\b|can (?:it|you|we)\b|how (?:much|does|do|can)\b|what (?:if|about|happens)\b|still\b)/i.test(text)) {
    const previous = [...previousQuestions].reverse().find((question) => scenarioFor(question));
    if (previous) {
      const inherited = scenarioFor(previous)!;
      return { reply: `${inherited.reply} For a school-specific follow-up, choose “Talk to admin”; I cannot confirm actions or terms that are not enabled.`, handoff: true };
    }
  }
  if (/\b(?:do you have|does (?:it|academix)|can (?:it|academix)|support|offer|available|feature|integrat)\b/i.test(text)
    && !hasTopic && !/\b(explore|all features|what features|hello|hi)\b/i.test(text)) {
    return { reply: 'I cannot confirm that specific feature as available. I do not want to mistake a demo tile or a customization request for a working feature. Choose “Talk to admin” and describe the action your school needs so its availability, setup and cost can be checked.', handoff: true };
  }
  const guide = guides.find((item) => item.words.test(text));
  return guide ? { reply: guide.reply, handoff: false } : {
    reply: 'I can help you explore AcademiX’s AI tutoring, school features, branding and registration. I do not want to guess about something outside that guide. Choose “Talk to admin” for an accurate answer about your school’s needs.',
    handoff: true
  };
}
