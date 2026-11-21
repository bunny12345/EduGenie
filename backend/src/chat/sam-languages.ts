import { BadRequestException } from '@nestjs/common';

export const SAM_LANGUAGES = [
  ['en', 'English', 'english'],
  ['hi', 'Hindi', 'hindi|हिंदी|हिन्दी'],
  ['te', 'Telugu', 'telugu|తెలుగు'],
  ['ta', 'Tamil', 'tamil|தமிழ்'],
  ['kn', 'Kannada', 'kannada|ಕನ್ನಡ'],
  ['ml', 'Malayalam', 'malayalam|മലയാളം'],
  ['mr', 'Marathi', 'marathi|मराठी'],
  ['bn', 'Bengali', 'bengali|bangla|বাংলা'],
  ['gu', 'Gujarati', 'gujarati|ગુજરાતી'],
  ['pa', 'Punjabi', 'punjabi|ਪੰਜਾਬੀ'],
  ['ur', 'Urdu', 'urdu|اردو'],
  ['or', 'Odia', 'odia|oriya|ଓଡ଼ିଆ'],
  ['as', 'Assamese', 'assamese|অসমীয়া'],
  ['sa', 'Sanskrit', 'sanskrit|संस्कृत'],
  ['ne', 'Nepali', 'nepali|नेपाली'],
  ['kok', 'Konkani', 'konkani|कोंकणी'],
  ['mai', 'Maithili', 'maithili|मैथिली'],
  ['sd', 'Sindhi', 'sindhi|سنڌي'],
  ['ks', 'Kashmiri', 'kashmiri|کٲشُر'],
  ['doi', 'Dogri', 'dogri|डोगरी'],
  ['mni', 'Manipuri', 'manipuri|meitei'],
  ['sat', 'Santali', 'santali|santhali'],
] as const;

function languageRequestPattern(names: string, flags = 'i') {
  return new RegExp(`(?:\\b(?:in|speak|explain|translate|use|switch to)\\s+(?:simple\\s+)?(?:${names})(?![a-z])(?:\\s+language\\b)?|(?:${names})(?:\\s+(?:please|mein|me|lo|లో|में|மொழியில்|ನಲ್ಲಿ)))`, flags);
}

function stripLanguageRequest(text: string) {
  for (const [, , names] of SAM_LANGUAGES) text = text.replace(languageRequestPattern(names, 'gi'), ' ');
  return text.replace(/\s+/g, ' ').trim();
}

function hasTeachingTopic(text: string) {
  return text.replace(
    /\b(?:please|can|could|would|you|sam|explain|teach|tell|me|speak|talk|say|translate|switch|use|it|this|that|again|same|thing|concept|topic|answer|explanation|above|previous|the|in|to|just|now|only|language|understand|i|want|need|make|easier|simple|more|natural|normally|normal|colloquial|so)\b|వివరించండి|చెప్పండి|समझाओ/gi, ''
  ).replace(/[\s\p{P}]/gu, '').length > 0;
}

export function isLanguageOnlyRequest(message: string) {
  const stripped = stripLanguageRequest(message);
  return stripped !== message.trim() && !hasTeachingTopic(stripped);
}

export function teachingRequest(message: string, history: Array<{ role: string; content: string }> = []) {
  const stripped = stripLanguageRequest(message);
  if (!isLanguageOnlyRequest(message)) return stripped;
  // Use the student's topic, never a previous assistant answer that might have
  // bypassed a homework guardrail.
  for (const turn of [...history].reverse()) {
    if (turn.role !== 'user') continue;
    const topic = stripLanguageRequest(turn.content);
    if (hasTeachingTopic(topic)) return topic;
  }
  return message;
}

export function writtenTutorRequest(message: string) {
  const concept = teachingRequest(message);
  return isLanguageOnlyRequest(concept) ? 'Please ask me which concept I want explained.' : concept;
}

export function writtenTutorHistory(history: Array<{ role: string; content: string }>) {
  return history.map((turn, index) => turn.role === 'user'
    ? { ...turn, content: writtenTutorRequest(teachingRequest(turn.content, history.slice(0, index))) }
    : turn);
}

export function isLanguageSubject(subject = '') {
  return SAM_LANGUAGES.some(([, , names]) =>
    new RegExp(`^(?:${names})(?:\\s+(?:language|literature))?$`, 'i').test(subject.trim())
  ) || /^(?:french|spanish|german|arabic|chinese|japanese)(?:\s+(?:language|literature))?$/i.test(subject.trim());
}

export function spokenLanguage(message: string, history: Array<{ role: string; content: string }> = [], subject = '') {
  if (/\benglish\b/i.test(subject) || /\benglish\s+(?:subject|homework|unit|lesson|grammar)\b/i.test(message)) return 'en-US';
  const requests = [...history.filter((entry) => entry.role === 'user').map((entry) => entry.content), message].reverse();
  for (const text of requests) {
    for (const [code, , names] of SAM_LANGUAGES) {
      if (languageRequestPattern(names).test(text)) {
        return code === 'en' ? 'en-US' : `${code}-IN`;
      }
    }
  }
  for (const [code, , names] of SAM_LANGUAGES) {
    if (code !== 'en' && new RegExp(`^(?:${names})(?:\\s+(?:language|literature))?$`, 'i').test(subject.trim())) return `${code}-IN`;
  }
  return 'en-US';
}

export function speechLanguageName(targetLanguage = 'en-US') {
  const code = targetLanguage.trim().toLowerCase().split('-')[0];
  const language = SAM_LANGUAGES.find((entry) => entry[0] === code);
  if (!language) throw new BadRequestException('Sam currently supports English and Indian languages for voice explanations.');
  return language[1];
}

export const SAM_WRITING_POLICY =
  '\nLANGUAGE POLICY: For mathematics, science, social studies and all non-language subjects, ' +
  'write your reply and check question in English even when the student requests another language; ' +
  'their voice playback can explain the same content in the requested Indian language. ' +
  'For an English-subject question always write and explain in English. For a regional or other ' +
  'language subject, write in that subject language when requested, preserving official quotations. ' +
  'The requested explanation language is a presentation preference, NOT a new subject or topic. ' +
  'For "explain that in Telugu" or another language-only follow-up, continue the same concept from the conversation; ' +
  'do not treat Telugu as a request to study Telugu or reject a covered concept because its explanation language differs from the materials. ' +
  'Judge topic coverage by the actual concept, regardless of the language used to ask it. ' +
  'If there is no prior concept, ask which concept the student wants explained. ' +
  'A language request never changes Unit/source boundaries, homework hint-only rules or exam restrictions. ' +
  'Do not add a second translated answer or a ready-to-submit answer.';
