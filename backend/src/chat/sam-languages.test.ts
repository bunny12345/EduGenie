import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { SAM_LANGUAGES, spokenLanguage, speechLanguageName, teachingRequest, writtenTutorHistory, writtenTutorRequest } from './sam-languages';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';

test('requested Indian voice language persists through follow-ups and can switch back to English', () => {
  const history = [{ role: 'user', content: 'Please explain in Telugu' }];
  assert.equal(spokenLanguage('Why does light bend?', history, 'Science'), 'te-IN');
  assert.equal(spokenLanguage('Explain in Hindi', history, 'Science'), 'hi-IN');
  assert.equal(spokenLanguage('In English please', history, 'Science'), 'en-US');
  assert.equal(spokenLanguage('हिंदी में समझाओ', [], 'Science'), 'hi-IN');
  assert.equal(spokenLanguage('తెలుగు లో వివరించండి', [], 'Science'), 'te-IN');
});

test('original spoken explanations use approved teaching, skip English and reject empty scripts', async () => {
  const service: ChatService = Object.create(ChatService.prototype);
  const requests: Array<{ messages: Array<{ role: string; content: string }>; options: unknown }> = [];
  let translation = 'आगे कौन सा कदम आज़माओगे?';
  Reflect.set(service, 'llm', { query: async (messages: Array<{ role: string; content: string }>, options: unknown) => {
    requests.push({ messages, options });
    if (messages[0].content.startsWith('SPOKEN EXPLANATION MEANING')) return '{"safe":true}';
    return translation;
  } });
  const approvedHint = 'Which step will you try next?';
  assert.equal(await service.prepareSpokenExplanation(approvedHint, 'en-US'), approvedHint);
  assert.equal(requests.length, 0);
  assert.equal(await service.prepareSpokenExplanation(approvedHint, 'hi-IN', 'Science'), translation);
  assert.deepEqual(JSON.parse(requests[0].messages[1].content), { approvedTeaching: approvedHint, subject: 'Science' });
  assert.match(requests[0].messages[0].content, /This is NOT a translation task/);
  assert.match(requests[0].messages[0].content, /ORIGINAL spoken explanation directly in natural Hindi/);
  assert.match(requests[0].messages[0].content, /spoken wording and length may differ/);
  assert.doesNotMatch(requests[0].messages[0].content, /This is a language-subject lesson/);
  assert.deepEqual(requests[0].options, { requireModelResponse: true });
  assert.deepEqual(requests[1].options, { requireModelResponse: true, responseFormat: 'json' });
  assert.equal(JSON.parse(requests[1].messages[1].content).speechText, translation);
  translation = '';
  await assert.rejects(service.prepareSpokenExplanation(approvedHint, 'te-IN'), /could not prepare a complete spoken explanation/);
});

test('speech verification accepts different native wording and rejects unsafe or malformed results', async () => {
  const service: ChatService = Object.create(ChatService.prototype);
  const approvedTeaching = 'A rational number is p/q, where p and q are integers and q is not zero. Can you identify the denominator?';
  const speechText = 'ముందు denominator identify చేద్దామా? Rational number అంటే p/q form లో ఉంటుంది. p, q integers; q zero కాకూడదు.';
  let verdict = '{"safe":true}';
  const requests: Array<Array<{ role: string; content: string }>> = [];
  Reflect.set(service, 'llm', { query: async (messages: Array<{ role: string; content: string }>) => {
    requests.push(messages);
    return messages[0].content.startsWith('SPOKEN EXPLANATION MEANING') ? verdict : speechText;
  } });
  assert.equal(await service.prepareSpokenExplanation(approvedTeaching, 'te-IN', 'Mathematics'), speechText);
  assert.equal(requests.length, 2);
  assert.deepEqual(JSON.parse(requests[1][1].content), { approvedTeaching, speechText, language: 'Telugu', subject: 'Mathematics' });
  assert.match(requests[1][0].content, /mathematical conditions.*check-question purpose/);
  assert.match(requests[1][0].content, /hint-only source must not gain any intermediate\/final answer/);
  for (const result of ['{"safe":false}', '{"safe":"true"}', '{}', 'null', 'not JSON']) {
    verdict = result;
    await assert.rejects(service.prepareSpokenExplanation(approvedTeaching, 'te-IN', 'Mathematics'), /could not (?:prepare|verify)/);
  }
});

test('speech-script endpoint returns verified text and surfaces preparation failures', async () => {
  const controller: ChatController = Object.create(ChatController.prototype);
  const script = 'ఇది rational numbers concept.';
  let failure = false;
  Reflect.set(controller, 'chatService', {
    prepareSpokenExplanation: async (text: string, language: string, subject: string) => {
      assert.equal(text, 'Approved English concept.');
      assert.equal(language, 'te-IN');
      assert.equal(subject, 'Mathematics');
      if (failure) throw new Error('Sam could not verify the spoken explanation.');
      return script;
    },
  });
  const req = { user: { sub: 'student', role: 'student' } };
  const payload = { studentId: 'student', text: 'Approved English concept.', targetLanguage: 'te-IN', subject: 'Mathematics' };
  assert.deepEqual(await controller.speechScript(req, payload), { success: true, speechText: script });
  failure = true;
  assert.deepEqual(await controller.speechScript(req, payload), { success: false, error: 'Sam could not verify the spoken explanation.' });
  await assert.rejects(controller.speechScript(req, { ...payload, studentId: 'another-student' }));
});

test('speech preparation preserves the complete source and rejects overlong input without model calls', async () => {
  const service: ChatService = Object.create(ChatService.prototype);
  let calls = 0;
  const text = `${'A concept. '.repeat(240)}Remember the denominator must not be zero.`;
  Reflect.set(service, 'llm', { query: async (messages: Array<{ role: string; content: string }>) => {
    calls++;
    if (messages[0].content.startsWith('SPOKEN EXPLANATION MEANING')) return '{"safe":true}';
    assert.equal(JSON.parse(messages[1].content).approvedTeaching, text);
    return 'Denominator zero కాకూడదు.';
  } });
  await service.prepareSpokenExplanation(text, 'te-IN', 'Mathematics');
  assert.equal(calls, 2);
  await assert.rejects(service.prepareSpokenExplanation('a'.repeat(12001), 'te-IN'), /too long for voice/);
  await assert.rejects(service.prepareSpokenExplanation('  ', 'te-IN'), /no explanation to speak/);
  assert.equal(calls, 2);
});

test('Telugu maths playback uses familiar English terminology and casual bilingual phrasing', async () => {
  const service: ChatService = Object.create(ChatService.prototype);
  let prompt = '';
  const reply = 'A fraction has a numerator and denominator. Which part will you identify first?';
  const spoken = 'Fraction లో numerator, denominator ఉంటాయి. First ఏ part identify చేస్తావు?';
  Reflect.set(service, 'llm', { query: async (messages: Array<{ role: string; content: string }>) => {
    if (messages[0].content.startsWith('SPOKEN EXPLANATION MEANING')) return '{"safe":true}';
    prompt = messages[0].content;
    assert.deepEqual(JSON.parse(messages[1].content), { approvedTeaching: reply, subject: 'Mathematics' });
    return spoken;
  } });
  assert.equal(await service.prepareSpokenExplanation(reply, 'te-IN', 'Mathematics'), spoken);
  assert.match(prompt, /numerator, denominator/);
  assert.match(prompt, /natural English-Telugu code-switching/);
  assert.match(prompt, /Do not force an English-word quota/);
  assert.match(prompt, /same essential facts, numbers, mathematical conditions/);
  assert.match(prompt, /hint-only.*spoken explanation must stay hint-only/);
});

test('every supported Indian language uses original native phrasing with familiar English terms', async () => {
  const service: ChatService = Object.create(ChatService.prototype);
  const prompts: string[] = [];
  const text = 'Keep the numerator and denominator in view. Which step will you try next?';
  Reflect.set(service, 'llm', { query: async (messages: Array<{ role: string; content: string }>) => {
    if (messages[0].content.startsWith('SPOKEN EXPLANATION MEANING')) return '{"safe":true}';
    prompts.push(messages[0].content);
    assert.deepEqual(JSON.parse(messages[1].content), { approvedTeaching: text, subject: 'Mathematics' });
    return 'stubbed bilingual speech';
  } });
  for (const [code, name] of SAM_LANGUAGES.filter(([code]) => code !== 'en')) {
    await service.prepareSpokenExplanation(text, `${code}-IN`, 'Mathematics');
    const prompt = prompts[prompts.length - 1];
    assert.match(prompt, /This is NOT a translation task/);
    assert.match(prompt, /Choose your own idiomatic sentence structure/);
    assert(prompt.includes(`natural English-${name} code-switching`));
    assert.match(prompt, /same essential facts, numbers, mathematical conditions/);
  }
});

test('written tutor requests and history keep concepts without carrying speech preferences into topic checks', () => {
  const history = [
    { role: 'user', content: 'Explain rational numbers in Telugu language' },
    { role: 'assistant', content: 'A rational number can be written as p/q.' },
    { role: 'user', content: 'Explain in Malayalam' },
  ];
  assert.deepEqual(writtenTutorHistory(history), [
    { role: 'user', content: 'Explain rational numbers' },
    history[1],
    { role: 'user', content: 'Explain rational numbers' },
  ]);
  assert.equal(writtenTutorRequest('Speak in Malayalam'), 'Please ask me which concept I want explained.');
  assert.equal(writtenTutorRequest('Explain black holes in Malayalam'), 'Explain black holes');
  assert.equal(writtenTutorRequest('What is Malayalam literature?'), 'What is Malayalam literature?');
});

test('language-subject playback keeps proper vocabulary instead of casual English substitutions', async () => {
  const service: ChatService = Object.create(ChatService.prototype);
  let systemPrompt = '';
  Reflect.set(service, 'llm', { query: async (messages: Array<{ role: string; content: string }>) => {
    if (messages[0].content.startsWith('SPOKEN EXPLANATION MEANING')) return '{"safe":true}';
    systemPrompt = messages[0].content;
    return 'ఒక చిన్న సూచన.';
  } });
  await service.prepareSpokenExplanation('A small hint.', 'te-IN', 'Telugu');
  assert.match(systemPrompt, /proper, clear subject-language vocabulary and grammar/);
  assert.match(systemPrompt, /Preserve literary wording, quotations/);
  assert.doesNotMatch(systemPrompt, /keep terms such as photosynthesis/);
  assert.match(systemPrompt, /same essential facts, numbers, mathematical conditions/);
});

test('language-only follow-ups keep the last student concept, but a new off-topic concept is not replaced', () => {
  const history = [
    { role: 'user', content: 'Why do plants need sunlight?' },
    { role: 'assistant', content: 'An answer that must not be used as the question.' },
    { role: 'user', content: 'Explain in Hindi' },
  ];
  assert.equal(teachingRequest('Please explain the same concept again in Telugu so I can understand it', history), 'Why do plants need sunlight?');
  assert.equal(teachingRequest('తెలుగు లో వివరించండి', history), 'Why do plants need sunlight?');
  assert.equal(teachingRequest('Explain black holes in Telugu', history), 'Explain black holes');
  assert.equal(teachingRequest('Explain in Telugu', []), 'Explain in Telugu');
  assert.equal(teachingRequest('Why do plants need sunlight?', history), 'Why do plants need sunlight?');
});

test('English subjects remain English and regional language subjects use their language', () => {
  assert.equal(spokenLanguage('Explain in Hindi', [], 'English'), 'en-US');
  assert.equal(spokenLanguage('Explain my English homework in Telugu'), 'en-US');
  assert.equal(spokenLanguage('Explain this poem', [], 'Tamil'), 'ta-IN');
  assert.equal(spokenLanguage('What is Hindi literature?', [], 'History'), 'en-US');
  assert.equal(spokenLanguage('Explain this', [{ role: 'assistant', content: 'Explain in Hindi' }]), 'en-US');
  assert.throws(() => speechLanguageName('fr-FR'), BadRequestException);
});

