const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.LLM_PORT || 11434;

app.post('/v1/chat', (req, res) => {
  const { prompt, message } = req.body || {};
  const text = prompt || message || '';
  // Very small mock reply generator for quick testing
  const reply = `EduGenie Mock Teacher: I read your prompt and would say — "${String(text).slice(0,200)}"`;
  res.json({ reply });
});

app.listen(port, () => {
  console.log(`Mock LLM server listening on http://localhost:${port}`);
});
