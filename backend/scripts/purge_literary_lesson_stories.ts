require('dotenv').config();
import { SupabaseService } from '../src/supabase.service';

/**
 * One-off cleanup: earlier Story Mode generations for language/literature
 * subjects invented a fictional narrative instead of retelling the actual
 * lesson story (fixed in chat.service.ts). Purge those cached rows so they
 * regenerate faithfully next time a student opens Story Mode — per-student
 * completion in lesson_story_progress is left untouched.
 */
const LITERARY_SUBJECT_KEYWORDS = [
  'english', 'hindi', 'sanskrit', 'urdu', 'french', 'spanish', 'german',
  'tamil', 'telugu', 'kannada', 'malayalam', 'marathi', 'gujarati', 'punjabi',
  'bengali', 'odia', 'assamese', 'literature', 'language',
];

(async () => {
  const db = new SupabaseService();
  const res = await db.client.from('lesson_stories').select('*');
  const rows = Array.isArray((res as any)?.data) ? (res as any).data : [];
  const toPurge = rows.filter((r: any) => {
    const key = String(r?.subject_key || '').toLowerCase();
    const title = String(r?.chapter_title || '').toLowerCase();
    return LITERARY_SUBJECT_KEYWORDS.some((kw) => key.includes(kw) || title.includes(kw));
  });

  console.log(`Found ${rows.length} cached stories, purging ${toPurge.length} literary-subject ones…`);
  for (const row of toPurge) {
    await db.client.from('lesson_stories').delete().eq('id', row.id);
    console.log(`  removed: ${row.chapter_title} (${row.subject_key})`);
  }
  process.exit(0);
})().catch((e) => {
  console.error('Purge failed:', e);
  process.exit(1);
});
