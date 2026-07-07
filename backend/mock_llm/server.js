const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.LLM_PORT || 11434;

app.post('/v1/chat', (req, res) => {
  const { prompt, message } = req.body || {};
  const text = prompt || message || '';
  // Look for optional StudentName line (added by backend when available)
  let studentName = null;
  const nameMatch = String(text).match(/StudentName:\s*(.*)$/m);
  if (nameMatch && nameMatch[1]) studentName = nameMatch[1].trim();
  // Very small mock reply generator for quick testing
  // If the prompt contains a 'Student asks:' line, extract the question and generate a simple answer.
  let question = '';
  const m = String(text).match(/Student asks:\s*(.*)$/m);
  if (m && m[1]) question = m[1].trim();

  let teacherReply = '';
  if (!question) {
    teacherReply = "Hello — how can I help this student today?";
  } else {
    const q = question.toLowerCase();
    if (q.includes('hi') || q.includes('hello')) {
      teacherReply = `Hi${studentName ? ' ' + studentName : ''}! I'm EduGenie — how can I help you learn today?`;
    } else if (q.startsWith('why') || q.includes('why')) {
      teacherReply = 'Great question — usually the sky looks blue because molecules in the atmosphere scatter blue light more than red.';
    } else if (q.includes('how') || q.includes('explain')) {
      teacherReply = `Let me explain: ${question}`;
    } else {
      // Handle "what is" style questions with a tiny knowledge base and typo matching
      const whatMatch = question.match(/what is(?: the| a| an)?\s+(.*)\??/i);
      if (whatMatch && whatMatch[1]) {
        const term = whatMatch[1].trim().toLowerCase();
        if (term.includes('my name')) {
          teacherReply = "I don't know your name yet — please tell me so I can remember it.";
        } else {
          const kb = {
            evaporation: 'Evaporation is the process where liquid turns into vapor, usually when heated or exposed to air.',
            photosynthesis: 'Photosynthesis is how plants convert sunlight, water, and carbon dioxide into food and oxygen.',
            gravity: 'Gravity is the force that attracts two bodies toward each other; on Earth it makes things fall toward the ground.'
          };
          // exact
          if (kb[term]) {
            teacherReply = kb[term];
          } else {
            // try fuzzy match by simple edit distance
            const norm = (s) => s.replace(/[^a-z]/g, '');
            const levenshtein = (a, b) => {
              if (!a.length) return b.length;
              if (!b.length) return a.length;
              const matrix = [];
              for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
              for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
              for (let i = 1; i <= b.length; i++) {
                for (let j = 1; j <= a.length; j++) {
                  if (b.charAt(i-1) === a.charAt(j-1)) matrix[i][j] = matrix[i-1][j-1];
                  else matrix[i][j] = Math.min(matrix[i-1][j-1] + 1, Math.min(matrix[i][j-1] + 1, matrix[i-1][j] + 1));
                }
              }
              return matrix[b.length][a.length];
            };
            const nterm = norm(term);
            let best = null; let bestScore = 999;
            for (const k of Object.keys(kb)) {
              const score = levenshtein(nterm, norm(k));
              if (score < bestScore) { bestScore = score; best = k; }
            }
            if (best && bestScore <= 2) {
              teacherReply = `${kb[best]} (interpreting "${term}" as "${best}")`;
            } else {
              teacherReply = `I read your prompt and would answer: "${question}"`;
            }
          }
        }
      } else {
        teacherReply = `I read your prompt and would answer: "${question}"`;
      }
    }
  }
  // Add lightweight follow-up suggestions when we know the student's name
  let followups = '';
  if (studentName) {
    followups = `\n\nFollow-up suggestions for ${studentName}: 1) Want a short practice quiz? 2) Want a simpler explanation?`;
  }

  const reply = `EduGenie Mock Teacher: ${teacherReply}${followups}`;
  res.json({ reply });
});

app.listen(port, () => {
  console.log(`Mock LLM server listening on http://localhost:${port}`);
});
