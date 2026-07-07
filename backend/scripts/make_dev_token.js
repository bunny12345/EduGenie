// Lightweight dev helper to create a JWT for local testing.
// Usage: node scripts/make_dev_token.js <studentId>
require('dotenv').config();
const jwt = require('jsonwebtoken');

const secret = process.env.SUPABASE_JWT_SECRET;
if (!secret) {
  console.error('SUPABASE_JWT_SECRET not set in environment or .env');
  process.exit(2);
}

const studentId = process.argv[2] || 'dev-student-1';
const token = jwt.sign({ sub: studentId, role: 'student' }, secret, { expiresIn: '1h' });
console.log(token);
