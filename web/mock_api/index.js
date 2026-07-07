const express = require('express');
const cors = require('cors');
const { nanoid } = require('nanoid');

const app = express();
app.use(cors());
app.use(express.json());

// in-memory memories store for mock
const memories = [
  { id: nanoid(), value: 'Student loves dinosaurs', student_id: 'test' },
  { id: nanoid(), value: 'Struggles with fractions', student_id: 'test' }
];

app.post('/chat', (req, res) => {
  const { studentId, message } = req.body || {};
  const reply = { text: `Mock reply for "${message}" (student ${studentId || 'unknown'})` };
  res.json({ answer: reply });
});

app.get('/chat/memory', (req, res) => {
  const studentId = req.query.studentId || 'test';
  const rows = memories.filter((m) => m.student_id === studentId).map(({ id, value }) => ({ id, value }));
  res.json(rows);
});

app.post('/chat/memory', (req, res) => {
  const { studentId, value } = req.body || {};
  const id = nanoid();
  memories.push({ id, value, student_id: studentId || 'test' });
  res.json({ id, value });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log('Mock API running on', port));
