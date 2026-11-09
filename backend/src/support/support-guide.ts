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

const teacherGuides = [
  { words: /\b(announcements?|notices?|schedule)\b/i, reply: 'On Teacher Home, choose your assigned class and open Announcements. Enter your notice and use the available schedule controls before posting. Check the selected class and dates if a notice is not visible. Do not include confidential student records in a support report.' },
  { words: /\b(homework|assignments?|assign|submissions?|resubmit|grad(?:e|ing))\b/i, reply: 'On Teacher Home, select your assigned class and open Assign Homework. Choose the available subject lessons, enter the instructions and dates, then assign the work. Use View History for previous assignments. In Students, select a student to review their homework and the available grading controls. If an action fails, report the page and steps without sharing student work or private records.' },
  { words: /\b(tests?|quiz(?:zes)?|exams?|mock|questions?|clone)\b/i, reply: 'Open Mock Tests on Teacher Home for test authoring. Use the available create, edit, clone and question controls, and check your assigned class before making changes. Save your work before leaving. For school exam marks, open Report Cards instead. Report any failed action with the test name and steps, not test answers or private records.' },
  { words: /\b(report cards?|marks|scores?|progress|performance)\b/i, reply: 'Open Student Progress to review learning reports for students in your assigned classes. Open Report Cards for school exam marks and the available entry controls. Confirm the class and student selection first. This help bot cannot access, alter or disclose student records; report display issues without including private details.' },
  { words: /\b(ai|assistant|sam|pdfs?|lessons?|subjects?|curriculum|uploads?)\b/i, reply: 'Open AI Assistant for subject-focused teaching help using the materials available to your assigned class. This floating Help Assistant is for portal operations, not lesson answers. Missing subjects, lessons or class assignments should be checked with your school administrator. Report an upload or display problem with the feature name, without sharing private files.' },
  { words: /\b(students?|roster|class(?:es)?|register|invites?)\b/i, reply: 'Open Students and select one of your assigned classes to view its roster and available student actions. School administrators manage teacher registration and class assignments. If a student or class is missing, confirm the assignment with your school administrator. Support cannot reveal account passwords or private student information.' },
  { words: /\b(password|login|log in|sign in|account)\b/i, reply: 'Use Teacher Login with the login ID and password provided by your school. Use the eye button where available to check your own password. For forgotten passwords or account access, contact your school administrator. Never send passwords or verification codes to this chat.' },
  { words: /\b(microphone|mic|voice|audio|sound)\b/i, reply: 'In AI Assistant, allow microphone access if requested and check device volume for voice playback. If microphone permission was denied, update the browser or app permission and try again. You can type instead. Report the affected feature without sending permission screenshots that contain private information.' },
  { words: /\b(slow|blank|freeze|frozen|crash|bug|glitch|issue|error|broken|not working)\b/i, reply: 'Keep a copy of unsent work, check your connection and reopen the affected page or app. Avoid repeating an assignment or marks submission. If the problem continues, choose Report an issue and describe the feature, what you tried and what happened. Never include passwords, student records or confidential files.' },
  { words: /\b(navigation|navigate|where|find|home)\b/i, reply: 'Use the teacher website sidebar or app bottom navigation for Teacher Home, AI Assistant, Students, Student Progress and Report Cards. The floating message button on Home opens this operational Help Assistant and your saved support requests.' },
];

const schoolAccountRemovalGuides = [
  {
    words: /\b(?:delet(?:e|ed|ing)|remov(?:e|ed|ing)|eras(?:e|ed|ing)|restore|recover|undo)\s+(?:(?:the|a|an|my|our|this|that|one|deleted)\s+){0,3}(?:students?|pupils?)\b|\b(?:students?|pupils?)(?:\s+accounts?)?\s+(?:(?:is|was|gets?|has been|will be|has to be|can be)\s+)?(?:delet(?:e|ed|ing|ion)|remov(?:e|ed|ing|al)|recovery|restoration)\b/i,
    reply: 'Deleting a student is an account-removal action, not just hiding them from the class list. It removes their school login account and student record and is intended to remove linked learning history, including homework, test attempts, progress and Orchard growth. Do not use Delete to change a class, correct details or fix a password.\n\nBefore deleting: check the student and class, and keep any required school records through your approved process. To proceed on the website, open Student Registration > Students (School-wide), find the student, choose Delete and review the confirmation before confirming. This bot cannot delete accounts or verify that cleanup completed. There is no self-service undo; registering again creates a new account and does not restore the old history. If deletion was accidental or you are unsure, connect to a technician before taking further action. Do not send private student records in chat.',
  },
  {
    words: /\b(?:delet(?:e|ed|ing)|remov(?:e|ed|ing)|eras(?:e|ed|ing)|restore|recover|undo)\s+(?:(?:the|a|an|my|our|this|that|one|deleted)\s+){0,3}teachers?\b|\bteachers?(?:\s+accounts?)?\s+(?:(?:is|was|gets?|has been|will be|has to be|can be)\s+)?(?:delet(?:e|ed|ing|ion)|remov(?:e|ed|ing|al)|recovery|restoration)\b/i,
    reply: 'Deleting a teacher removes their teacher account; it is not the same as changing their subject or classes. Students linked to that teacher are unlinked, not deleted by the teacher-removal action. Arrange a replacement teacher and check student assignments so access to class materials is not disrupted.\n\nOn the website, open Teachers & Invites, find the teacher in the Teachers list, choose Delete and review the confirmation. For a class or subject correction, use Edit instead. This bot cannot perform deletion, verify cleanup or restore an account. If it was accidental, connect to a technician; do not assume re-registering restores old links.',
  },
];

const schoolGuides = [
  ...schoolAccountRemovalGuides,
  {
    words: /(?=.*\b(students?|pupils?)\b)(?=.*\b(password|passcode|reset|forgot(?:ten)?|log ?in|sign ?in)\b)/i,
    reply: 'For a student who cannot sign in, first check that they are using Student Login and the correct school-issued login ID. Do not delete and re-register them to fix a password.\n\nOn the website, open Student Registration > Students (School-wide), filter to the student\'s class and select Reset password for the correct student. Enter a new password of at least 8 characters and save, then share it privately through your school\'s approved channel. Ask the student to try the new password. This bot cannot view or reset passwords. Never paste passwords or verification codes here; connect to a technician if the reset fails.',
  },
  {
    words: /(?=.*\b(teachers?)\b)(?=.*\b(password|passcode|reset|forgot(?:ten)?|log ?in|sign ?in)\b)/i,
    reply: 'For a teacher login problem, check they are using Teacher Login and their school-issued login ID. On the website, open Teachers & Invites, find the correct teacher and use Reset password. Save the new password and share it privately through your school\'s approved channel, then have the teacher try again. Do not delete the teacher to fix access. This bot cannot view or reset credentials; never send passwords or verification codes here. Connect to a technician if the reset fails.',
  },
  {
    words: /(?=.*\b(students?|pupils?)\b)(?=.*\b(edit|chang(?:e|ing)|updat(?:e|ing)|correct|wrong|mov(?:e|ing)|transfer)\b)/i,
    reply: 'To correct a student\'s name, class or assigned teacher, use Edit rather than Delete. On the website, open Student Registration > Students (School-wide), choose the class filter, find the correct student and select Edit. Update the available fields and save. Check the student\'s class and teacher afterward; changing a class can change which lessons and assignments they see. Do not assume previous-class work moves to the new class. For login trouble use Reset password instead. This bot cannot change records; report a failed save without sharing private student details.',
  },
  {
    words: /(?=.*\b(teachers?)\b)(?=.*\b(edit|chang(?:e|ing)|updat(?:e|ing)|correct|wrong|reassign)\b)/i,
    reply: 'Open Teachers & Invites on the website and find the teacher in the Teachers list. Use Edit to correct the available details, subject or assigned classes, then save. Check the selected classes and ask the teacher to reopen their portal to confirm the expected roster and materials. Do not delete an account just to change its assignment, and do not assume changing a teacher moves existing student links automatically. This bot cannot change records; connect to a technician if saving or assignments still fail.',
  },
  { words: /\b(progress|report cards?|marks|scores?|performance|learning report)\b/i, reply: 'Open Student Progress in the school sidebar. Select All classes to search for a student anywhere in your school, or choose a class to narrow the list. Select the student to view their learning report and school report cards below it. Exam results appear once all subject marks are entered; pending exams show the subjects still outstanding. This help bot cannot access or change student records.' },
  { words: /\b(password|login|log in|sign in|account access)\b/i, reply: 'Use School Login with your registered school email and password. The eye button lets you check your own password where available. For access problems, connect to a technician without sharing your password, verification codes or private account records. This bot cannot reveal or reset credentials.' },
  { words: /\b(curriculum|pdfs?|lessons?|subjects?|uploads?|documents?)\b/i, reply: 'Open Curriculum Upload in the school sidebar. Select the intended class and subject, then use the available lesson and PDF upload controls. Check the class, subject and uploaded lesson if material is missing in the student or teacher portal. Report failed uploads with the feature name and steps, not confidential files.' },
  { words: /\b(invites?|links?|registration link)\b/i, reply: 'Use Student Registration for the available student registration or self-registration controls. Keep portal-generated links private, share them only with intended recipients, and do not paste them into support. For teachers, open Teachers & Invites and use Manual Teacher Registration. If an expected invite control is unavailable, connect to a technician rather than creating your own link.' },
  { words: /\b(teachers?|assignments?|grades?|class assignment)\b/i, reply: 'Open Teachers & Invites in the school sidebar. Use Manual Teacher Registration to register a teacher and assign their subject and classes. The Teachers list on that page has class filters and available account actions. Confirm class assignments when a teacher cannot see the expected students or materials. Support cannot disclose teacher passwords or private records.' },
  { words: /\b(students?|roster|enrol|enroll)\b/i, reply: 'Open Student Registration in the school sidebar to register a student with the correct class and teacher details. The Students (School-wide) list on the same page provides class filters and available account actions. Double-check the selected student before changes. Report an operation problem without including personal records or passwords.' },
  { words: /\b(school registration|register.*school|new school)\b/i, reply: 'New school registration is restricted to the platform owner through the protected owner page. School administrators use their existing school account to manage teachers, students and curriculum. This bot cannot create schools or grant owner access.' },
  { words: /\b(slow|blank|freeze|frozen|crash|bug|glitch|issue|error|broken|not working)\b/i, reply: 'Keep a copy of unsent work, check your connection and reopen the affected page. Avoid repeatedly submitting registrations or uploads. If the issue continues, choose Report an issue and describe the page, steps and result. Never send passwords, invite links, student records or confidential files.' },
  { words: /\b(overview|navigation|navigate|where|find|home|classes?)\b/i, reply: 'Use the school sidebar for Overview, Teachers & Invites, Curriculum Upload, Student Registration and Student Progress. Teacher registration and the teacher roster are inside Teachers & Invites; the student roster is inside Student Registration. Student Progress offers school-wide student search, learning reports and report cards. The floating message button on Overview opens school operational help and your saved support requests. The help bot cannot access or change school records.' },
];

type SupportRole = 'student' | 'teacher' | 'school_admin';
type SupportScenario = { topic: RegExp; when: RegExp; reply: string };

const homeworkTopic = /\b(homeworks?|assignments?|submissions?|resubmit|resubmission)\b/i;
const progressTopic = /\b(progress|learning report|graph|scores?)\b/i;
const missing = /\b(missing|empty|blank|not (?:showing|visible|appearing|there|able to (?:see|find))|cannot (?:see|find)|can't (?:see|find)|disappeared|unavailable)\b/i;
const failed = /\b(fail(?:ed|ing|s)?|error|stuck|freez(?:e|es|ing)|frozen|not (?:working|saving|sending)|(?:cannot|can't|unable to|not able to) (?:submit|save|upload|send)|did not (?:save|submit)|didn't (?:save|submit))\b/i;
const studentScenarios: SupportScenario[] = [
  {
    topic: homeworkTopic,
    when: /\b(overdue|late|expired|deadline)\b/i,
    reply: 'Check the homework status and the dates shown for that assignment. Keep a copy of your work. Use Submit or Resubmit only if the portal still offers it; do not assume an overdue task can be reopened. Resubmission is limited to the latest assigned homework within one hour of the last submission. If a control is no longer available, ask your teacher how to provide the work or correction. This bot cannot extend deadlines or reopen assignments.',
  },
  {
    topic: /\b(games?|flashcards?|memory maze|quiz rush)\b/i, when: failed,
    reply: 'Note which game and chapter is affected. Check your connection, then return to Games and reopen that game once. Do not assume an unfinished round was saved. If buttons are hidden, text overlaps or the round still freezes, report the game, screen and device type; only attach a screenshot after removing private details. I cannot complete a round or award its score for you.',
  },
  {
    topic: progressTopic,
    when: /\b(homework|tests?|mock|games?|orchard|growth|understanding|practice|calculat\w*|only|wrong|lower|drop|decreas\w*|improv\w*)\b/i,
    reply: 'Your subject graph is not based only on games. It combines recorded understanding, tree growth, practice, homework and tests/mock tests; components without evidence are excluded from that subject calculation. Submitting ungraded homework can count as completion, but it is not a teacher-awarded full mark. Lower results can lower the score. The overall learning report combines several learning and engagement measures, so it is not the average of subject graphs or your school exam percentage. First check the subject and date range and whether the work shows as submitted. If recorded work is missing from Progress, report the subject, activity type and approximate time without sending answers or private records. I cannot inspect or change your results.',
  },
  {
    topic: homeworkTopic,
    when: /\b(resubmit|resubmission|wrong (?:file|photo|answer)|edit|replace|change|correct|window)\b/i,
    reply: 'If you sent the wrong work, open Homework, choose the subject and check the submitted assignment. Editing and resubmitting is allowed only for your latest assigned homework, within one hour of the last submission, when the controls are available. Keep your corrected work before trying. If the window has closed or the assignment is older, ask your teacher how to provide the correction; do not keep submitting or delete your account. This bot cannot extend deadlines, reopen work or replace a submission.',
  },
  {
    topic: homeworkTopic,
    when: /\b(grade|graded|marks?|feedback|zero|0|pending)\b/i,
    reply: 'Submitted and graded mean different things. Open that homework and check its status, grade and teacher feedback. A submission can be recorded before your teacher marks it; an ungraded task is not automatically a marked zero or full marks. If it is graded and you think the mark is wrong, ask your teacher to review it. This bot cannot grade work or change a result. Report a display problem only if the saved status or feedback is not appearing.',
  },
  {
    topic: homeworkTopic, when: failed,
    reply: 'Keep a copy of your answer and photos first. Reopen Homework and check whether that assignment already says Submitted before retrying; a connection problem does not prove that the save failed. Check your connection and any message beside the attachment or Submit control. If no submission is recorded, try again once using the allowed controls. If it still fails, report the subject, approximate time and the visible error without attaching private work. I cannot confirm a submission from this chat.',
  },
  {
    topic: homeworkTopic, when: missing,
    reply: 'Check the selected subject and Homework filters, including history for older work. Make sure you are in the correct school account and class. Ask your teacher whether the assignment was given to your class and is currently available. Do not submit under another subject to work around missing homework. If your teacher confirms it should be visible, report the subject and page; do not send your login details or assignment answers.',
  },
  {
    topic: /\b(orchard|trees?|mastery|golden fruit)\b/i, when: /./,
    reply: 'Open My Orchard and select the subject to check its chapter stages and next activities. A homework submission or game does not automatically produce a fully grown tree: stages require different lesson, practice and understanding milestones, and later stages include spaced reviews. Golden Fruit also requires strong understanding. Signing in alone is not growth. Complete the next available activity for that subject/chapter rather than repeating an unrelated task. If a completed activity is not reflected, report the subject, activity and time; I cannot manually grow or reset trees.',
  },
  {
    topic: /\b(sam|tutor|lessons?|pdfs?|subjects?)\b/i, when: missing,
    reply: 'Check that you selected the right subject and lesson in AI Tutor. Sam uses materials available to your class, so ask your teacher or school administrator to check the class assignment and uploaded lesson if it is missing. Do not upload confidential files into support. If your school confirms the material is available but you still cannot see it, report the subject and affected page.',
  },
  {
    topic: /\b(sam|tutor)\b/i, when: /\b(wrong|off.topic|unrelated|answer|explain|understand)\b/i,
    reply: 'For a lesson question, select the correct subject and lesson in AI Tutor, then point to the part you want explained. Sam stays within that lesson, so an unrelated question may be redirected. If a reply looks incorrect, check it with your teacher rather than relying on it as a final answer. This Help Assistant handles portal use, not lesson solutions. Report a repeated reply problem with the feature and subject, without copying private conversations.',
  },
  {
    topic: /\b(tests?|mock|quiz|exam)\b/i, when: /\b(frozen|freeze|stuck|fail\w*|submit|retake|retry|again|lost|disappeared)\b/i,
    reply: 'If a test freezes or submission is uncertain, avoid starting another attempt immediately. Check whether the test already shows a completed result, and note the test name, time and visible message. Availability and another attempt depend on the test controls and your teacher; I cannot reopen a test, restore unsaved answers or change a score. Ask your teacher about an interrupted attempt, and report a technical problem without sending test answers.',
  },
  {
    topic: /\b(streak|coins?|rewards?|check.in)\b/i, when: /./,
    reply: 'Logging in alone does not count toward your streak. Recorded learning activity or a Rewards check-in does. Open Rewards and check whether the action was already recorded before pressing again. A check-in earns the displayed reward, not unlimited coins from repeated taps. If activity or coins are missing, report the action and approximate date; this bot cannot award coins or edit streaks.',
  },
  {
    topic: /\b(accounts?|password|login|log in|sign in)\b/i, when: /\b(delet\w*|remov\w*|restore|recover|forgot\w*|reset)\b/i,
    reply: 'For forgotten login details, contact your school administrator; do not delete or create a replacement account to solve access trouble. A school-admin deletion is intended to remove the student account and linked learning history, not just hide it. There is no self-service undo, and registering again does not restore old progress. If deletion was accidental, ask the school administrator to contact a technician. I cannot restore accounts, view passwords or guarantee recovery. Never send passwords or verification codes here.',
  },
];

const teacherScenarios: SupportScenario[] = [
  {
    topic: /\b(ai assistant|curriculum|pdfs?|lessons?|subjects?)\b/i, when: missing,
    reply: 'In AI Assistant, check the selected class, subject and lesson. Ask your school administrator to verify your assigned classes and that the lesson material was uploaded to the intended class/subject. Another class having a PDF does not make it available to yours. Do not copy confidential files into support. If the assignment and upload are correct but material is still missing, report the affected feature and subject.',
  },
  {
    topic: homeworkTopic, when: /\b(grad(?:e|ed|ing)|marks?|feedback|wrong|correct)\b/i,
    reply: 'To review submitted work, open Students, select your assigned class and student, then open the homework and its grading controls. Check the submission before saving a grade or feedback. Open the saved item again to confirm the displayed result; do not repeatedly save if the response is uncertain. If it is wrong, use the available grading controls to correct it, or report the failed save. This bot cannot read student work, mark it or change grades. School exam marks belong in Report Cards, not homework grading.',
  },
  {
    topic: homeworkTopic, when: missing,
    reply: 'Check the class selected on Teacher Home and the assignment in View History. Confirm the intended subject, lesson and dates, then ask the student to check the same subject and their filters. A missing student or class assignment must be checked with your school administrator. Do not assign a duplicate just because one student cannot see the first. If the saved assignment still does not appear, report the feature and steps without student records.',
  },
  {
    topic: homeworkTopic, when: failed,
    reply: 'Keep a copy of the instructions before leaving. Check View History to see whether the homework was already created before trying again, so students do not receive duplicates. Confirm the selected class and required fields, then retry once if no saved item exists. Report the visible error and page if it still fails; I cannot confirm delivery or assign work from this chat.',
  },
  {
    topic: /\b(tests?|mock|questions?|quiz)\b/i, when: /\b(clone|copy|duplicate|edit|chang\w*|delet\w*|remov\w*)\b/i,
    reply: 'Open Mock Tests on Teacher Home and select the correct test and class. Use Clone when you need a separate copy, or Edit for the selected test and its question controls. Save and review the test and questions before using it. Treat Delete as destructive: check the selected item first and do not assume there is an undo or that cloning restores old attempts. If students already attempted the test, check with your school before changing it. This bot cannot edit tests or restore deleted content.',
  },
  {
    topic: /\b(report cards?|marks)\b/i, when: /./,
    reply: 'Open Report Cards and check the class, student and exam before entering or correcting marks. A school exam result can remain pending while subject marks are outstanding; check what is still missing rather than entering invented zeros to publish it. Save using the available controls and reopen the record to check it. Learning Progress is a different report and is not your school exam mark sheet. I cannot view, calculate or change an individual student record here.',
  },
  {
    topic: /\b(students?|roster|class(?:es)?)\b/i, when: missing,
    reply: 'Open Students and check the assigned-class selector first. If a class or student is still missing, ask your school administrator to verify your classes and the student assignment. Do not create another student account as a workaround; that can separate their history. This assistant cannot grant class access or list private student records. Report a display problem after the school confirms the assignment.',
  },
  {
    topic: /\b(students?|accounts?|password|login|sign in)\b/i, when: /\b(delet\w*|remov\w*|reset|forgot\w*|recover|restore)\b/i,
    reply: 'Ask your school administrator to manage account deletion or reset school-issued login details. Do not delete and re-register a student or teacher to fix a password or class assignment. Student deletion is intended to remove the account and linked learning history; teacher deletion unlinks assigned students rather than deleting them. There is no self-service undo to rely on. I cannot perform these actions, reveal passwords or guarantee recovery; use technician support for an accidental deletion.',
  },
  {
    topic: progressTopic, when: /./,
    reply: 'Open Student Progress and check the student, class and reporting period. Learning reports use recorded understanding, tree growth, practice, homework and test activity, not games alone; the overall learning score is not a school exam percentage. Submitted but ungraded homework is completion evidence, not automatically a full grade. Check the source homework or test status before reporting a missing result. This assistant cannot inspect student records or change scores. Use Report Cards for school exam marks.',
  },
  {
    topic: /\b(announcements?|notices?)\b/i, when: missing,
    reply: 'Check the selected class and the announcement dates and schedule on Teacher Home. Confirm the notice was saved before posting it again. Ask the student to check the correct account and class. If it is still missing when it should be visible, report the page, intended class and approximate posting time without copying confidential notice content.',
  },
];

const schoolScenarios: SupportScenario[] = [
  {
    topic: progressTopic, when: /./,
    reply: 'Open Student Progress and check the selected student, class and reporting period. Learning reports use recorded understanding, tree growth, practice, homework and tests/mock tests, not games alone. The overall learning score is not the average of subject graphs or a school exam percentage. If a result appears wrong, ask the responsible teacher to check the source submission or test status first. I cannot inspect private records or change scores. Report a confirmed display mismatch without sending student records.',
  },
  {
    topic: /\b(curriculum|pdfs?|lessons?|subjects?|uploads?|documents?)\b/i, when: missing,
    reply: 'Open Curriculum Upload and check the exact class, subject and lesson. Confirm the lesson/document is listed after the upload, then check whether the affected teacher or student is assigned to that class. A file under another class does not make it available to everyone. Avoid duplicate uploads while unsure whether the first saved. If it remains missing, report the feature, class/subject and visible error without attaching confidential files.',
  },
  {
    topic: /\b(curriculum|pdfs?|lessons?|uploads?|documents?)\b/i, when: failed,
    reply: 'Keep the original file. In Curriculum Upload, check the selected class and subject, the required fields and any file-validation message. Check the lesson/document list before retrying so you do not create duplicates. Retry once with the allowed controls if no saved upload exists. Report the displayed error if it still fails; I cannot inspect private files or confirm an upload from chat.',
  },
  {
    topic: /\b(report cards?|marks)\b/i, when: /./,
    reply: 'Open Student Progress, select the student and check the school report cards below the learning report. A pending exam may still need subject marks; check the outstanding subjects with the responsible teachers instead of treating blanks as zero. Learning graphs and school exam results measure different things. I cannot read student marks or publish or change them here.',
  },
  {
    topic: /\b(invites?|registration links?)\b/i, when: /\b(expired|invalid|fail\w*|not working|wrong|shared|public|leak\w*)\b/i,
    reply: 'Use only the registration controls and links generated by the portal for the intended recipients. Check whether the registration has already completed before sending another link. Never paste the link into support. If a link is invalid, shared with the wrong person or no longer works, stop distributing it and connect to a technician; this bot cannot invalidate, inspect or renew links, and cannot promise a particular expiry period.',
  },
];

function scenariosFor(role: SupportRole) {
  return role === 'student' ? studentScenarios : role === 'teacher' ? teacherScenarios : schoolScenarios;
}

export function answerSupportQuestion(text: string, role: SupportRole = 'student', previousQuestions: string[] = []) {
  const initialSuggestions = role === 'school_admin'
    ? ['How do I register a teacher?', 'How do I register a student?', 'How do I upload curriculum?']
    : role === 'teacher'
    ? ['How do I assign homework?', 'How do I create a test?', 'How do I use AI Assistant?']
    : ['How do I submit homework?', 'How do I use Sam?', 'My microphone is not working'];
  if (/\b(secrets?|service.?role|source code|databases?|schemas?|servers?|api.?keys?|jwt|prompts?|system instructions?|credentials?|tokens?|configuration|sql|backend|environment variables?|stack traces?|infrastructure|exploit|bypass|implementation|architecture|other (?:students?|teachers?).{0,15}(?:records?|passwords?|marks))\b/i.test(text)) {
    return { reply: 'I can help you use AcademiX, but I cannot provide internal systems, code, keys, credentials or private information. Describe the feature you are trying to use, without sharing any secrets.', needsTechnician: true, suggestions: initialSuggestions };
  }
  if (/\b(support|tickets?|requests?|issues?)\b/i.test(text) && /\b(resolved|closed|48 hours|retention|how long)\b/i.test(text)) {
    return {
      reply: 'Resolved support requests and their messages are automatically deleted 48 hours after resolution. Open requests are kept. Sending another message before deletion reopens the request; if it is resolved again, a new 48-hour period starts. Deleted conversations cannot be reopened here, so create a new support request if you need more help. This policy does not remove copies already delivered by email.',
      needsTechnician: false, suggestions: ['Report an issue', 'Connect to a technician'],
    };
  }
  if (/\b(solve (?:my |the |this |an? )?(?:homework|equations?|math|questions?|problems?|quiz|test)|write (?:my|the|an?) essay)\b|\b(?:give|show|provide|tell).{0,30}\b(?:test|quiz|homework) answers?\b/i.test(text)) {
    return { reply: 'This Help Assistant explains how to use AcademiX; it does not provide lesson solutions or test answers. For learning help, use AI Tutor as a student or AI Assistant as a teacher. I can help with the portal controls, or connect you to a technician for an app issue.', needsTechnician: false, suggestions: initialSuggestions };
  }
  const scenarios = scenariosFor(role);
  const mentionsTopic = (question: string) => scenarios.some((scenario) => scenario.topic.test(question))
    || (role === 'school_admin' && /\b(students?|teachers?)\b/i.test(question));
  const hasTopic = mentionsTopic(text)
    || /\b(microphone|mic|voice|audio|password|login|log in|sign in|calendar|library|invites?|registration|rewards?|coins?)\b/i.test(text);
  const followUp = /^(?:(?:and|but|so|ok(?:ay)?)[, ]+)?(?:it |that |they |them |what (?:if|about|happens)|can i |how (?:do i|can i)|still\b|does (?:it|that)|will (?:it|that))/i.test(text);
  // Only short follow-ups inherit a recent user topic, never instructions or bot text.
  const previous = !hasTopic && followUp
    ? [...previousQuestions].reverse().find(mentionsTopic)
    : undefined;
  const context = previous ? `${previous}\n${text}` : text;
  if (/\b(still|already tried|tried (?:that|everything)|did(?:n't| not) help|same (?:problem|error)|not fixed)\b/i.test(text)) {
    return {
      reply: 'If you already tried the suggested checks, do not keep repeating submissions or destructive actions. Choose Connect to a technician or Report an issue. Include the affected page, what you tried, the approximate time and the visible error, plus whether you use the website or app. Keep unsent work. I cannot inspect your account or promise recovery; do not send passwords, codes, private records or confidential files.',
      needsTechnician: true, suggestions: ['Connect to a technician', 'Report an issue'],
    };
  }
  if (/\b(microphone|mic|voice|audio|sound|hear)\b/i.test(text) && role !== 'school_admin') {
    return {
      reply: 'For voice input, allow microphone access in the permissions for this website or app and make sure another app is not using the mic. For missing playback, check device volume, the audio output and the tutor mute control where available. Type your question while checking voice; do not keep recording private conversations. If permission is enabled but it still fails, report whether input or playback is affected and whether you use the website or app. I cannot change device permissions from here.',
      needsTechnician: false, suggestions: ['Report an issue', 'Connect to a technician'],
    };
  }
  // When both account types are mentioned, answer the first explicit removal
  // target, not a later consequence such as "are students deleted?".
  const removalGuide = role === 'school_admin' ? schoolAccountRemovalGuides
    .map((guide) => ({ guide, index: context.search(guide.words) }))
    .filter((match) => match.index >= 0)
    .sort((a, b) => a.index - b.index)[0]?.guide : undefined;
  if (removalGuide) return { reply: removalGuide.reply, needsTechnician: false, suggestions: ['Report an issue', 'Connect to a technician'] };
  const scenario = scenarios.find((item) => item.topic.test(context) && item.when.test(text));
  if (scenario) return { reply: scenario.reply, needsTechnician: false, suggestions: ['Report an issue', 'Connect to a technician'] };
  if (role === 'school_admin' && /\b(undo|restore|recover|delet(?:e|ed|ing|ion)|remov(?:e|ed|ing|al))\b/i.test(text)
    && !/\b(students?|pupils?|teachers?)\b/i.test(context)) {
    return {
      reply: 'Which item do you mean: a student account, teacher account, or an uploaded lesson/document? Include the item type and whether you want to understand the effect, carry out the action or ask about an accidental deletion. Do not include private records. Do not delete anything while unsure; this bot cannot perform deletions or promise recovery. Connect to a technician for an accidental deletion.',
      needsTechnician: true, suggestions: ['What happens if I delete a student account?', 'What happens if I delete a teacher account?', 'Connect to a technician'],
    };
  }
  if (/\b(delet\w*|remov\w*|restore|recover|undo)\b/i.test(text)) {
    return {
      reply: 'Please specify the item and whether you mean changing it, deleting it or recovering an accidental deletion. Use only the controls available to your role and do not delete or re-register an account as a workaround. I cannot perform destructive actions or guarantee an undo or recovery. Connect to a technician before proceeding if you are unsure; do not send private records.',
      needsTechnician: true, suggestions: ['Connect to a technician', 'Report an issue'],
    };
  }
  if (previous) {
    return {
      reply: 'Please describe the action you mean and what happened on that page. I do not have a verified answer for this follow-up, and I do not want to guess. Do not send passwords, answers or private records. Choose Connect to a technician if the earlier steps did not solve it.',
      needsTechnician: true, suggestions: ['Connect to a technician', 'Report an issue'],
    };
  }
  const guide = (role === 'school_admin' ? schoolGuides : role === 'teacher' ? teacherGuides : guides).find((item) => item.words.test(text));
  if (guide) return { reply: guide.reply, needsTechnician: false, suggestions: ['Report an issue', 'Connect to a technician'] };
  if (/^(hi|hello|hey|thanks|thank you)[!. ]*$/i.test(text)) {
    return { reply: 'Hi! I can help with using AcademiX on the website or app. What are you trying to do? Please do not share passwords or private records.', needsTechnician: false, suggestions: initialSuggestions };
  }
  return { reply: 'I do not have a verified guide for that question. I can help with AcademiX features, but I will not guess. If this is an app or website issue, choose Connect to a technician and explain it so a person can help.', needsTechnician: true, suggestions: ['Connect to a technician', 'Report an issue'] };
}
