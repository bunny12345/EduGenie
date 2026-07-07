#!/usr/bin/env node
// Re-embed all memories using OpenAI embeddings and update via Supabase REST (service role key)
// Usage: node scripts/reembed_all_memories.js

// Prefer native global fetch (Node 18+). Fallback to node-fetch (CJS or ESM default).
let fetch = globalThis.fetch;
if (!fetch) {
  try {
    const nf = require('node-fetch');
    fetch = nf && (nf.default || nf);
  } catch (e) {
    // ignore; we'll throw a clear error when attempting to use fetch
  }
}
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function main() {
  const env = fs.readFileSync('.env', 'utf8');
  const get = (k) => {
    const m = env.match(new RegExp('^' + k + "=(.*)$", 'm'));
    return m ? m[1].trim() : process.env[k];
  };
  const SUPABASE_URL = get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = get('SUPABASE_SERVICE_ROLE_KEY');
  const OPENAI_API_KEY = get('OPENAI_API_KEY') || process.env.OPENAI_API_KEY;
  const EMBEDDING_COLUMN = (get('EMBEDDING_COLUMN') || process.env.EMBEDDING_COLUMN || 'embedding').trim();
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
    process.exit(1);
  }
  if (!OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY missing');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  console.log('Fetching memories...');
  // Fetch in pages
  let offset = 0;
  const page = 100;
  let totalUpdated = 0;
  while (true) {
    const res = await supabase.from('memories').select('id,value').range(offset, offset + page - 1);
    const rows = (res && res.data) || [];
    if (!rows || rows.length === 0) break;
    for (const r of rows) {
      try {
        const emb = await getEmbedding(r.value, OPENAI_API_KEY);
        // update row into configured column
        const payload = {};
        payload[EMBEDDING_COLUMN] = emb;
        await supabase.from('memories').update(payload).eq('id', r.id);
        totalUpdated++;
        if (totalUpdated % 50 === 0) console.log('Updated', totalUpdated);
      } catch (e) {
        console.warn('failed embedding for', r.id, e.message || e);
      }
    }
    offset += page;
  }
  console.log('Done. Updated', totalUpdated);
}

async function getEmbedding(text, key) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ input: text || '', model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small' })
  });
  const data = await res.json();
  if (!data || !data.data || !data.data[0] || !Array.isArray(data.data[0].embedding)) throw new Error('bad embed');
  return data.data[0].embedding;
}

main().catch((e) => { console.error(e); process.exit(1); });
