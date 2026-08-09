/**
 * Drive one subject tree through each target stage and print the live card stage.
 *
 * Usage:
 *   node scripts/orchard_stage_walk.js [studentId] [subjectKey]
 */
require('dotenv').config();
const { execSync } = require('node:child_process');
const jwt = require('jsonwebtoken');

const studentId = process.argv[2] || 'f83c44fc-d57f-48f9-9552-2ccfee4f4aed';
const subjectKey = process.argv[3] || 'mathematics';
const stages = ['seed', 'sprout', 'young_plant', 'growing_tree', 'mature_tree', 'blossom', 'fruit', 'golden_fruit'];

const token = jwt.sign({ sub: studentId, role: 'student' }, process.env.SUPABASE_JWT_SECRET, { expiresIn: '1h' });

async function getCard() {
  const res = await fetch(`http://localhost:3000/orchard?studentId=${studentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await res.json();
  const t = (j.trees || []).find((x) => x.subjectKey === subjectKey);
  return t || null;
}

(async () => {
  console.log(`\n== Stage walk: ${subjectKey} ==`);
  execSync(`node scripts/orchard_growth_probe.js ${studentId} ${subjectKey} --reset > /dev/null`, { stdio: 'inherit' });

  let card = await getCard();
  console.log(`seed         -> stage=${card?.stage} completed=${card?.completedChapters}/${card?.totalChapters} progress=${card?.progressPct}%`);

  for (const target of stages.slice(1)) {
    execSync(`node scripts/orchard_stage_to.js ${studentId} ${subjectKey} ${target}`, { stdio: 'ignore' });
    card = await getCard();
    console.log(`${target.padEnd(12)} -> stage=${card?.stage} completed=${card?.completedChapters}/${card?.totalChapters} progress=${card?.progressPct}%`);
  }
})();
