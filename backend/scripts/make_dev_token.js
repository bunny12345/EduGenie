// Lightweight dev helper to create a JWT for local testing.
// Usage: node scripts/make_dev_token.js <userId> [role]
require('dotenv').config();
const jwt = require('jsonwebtoken');

const secret = process.env.SUPABASE_JWT_SECRET;
if (!secret) {
  console.error('SUPABASE_JWT_SECRET not set in environment or .env');
  process.exit(2);
}

const userId = process.argv[2] || 'dev-student-1';
const role = (process.argv[3] || 'student').toLowerCase();
const token = jwt.sign({ sub: userId, role }, secret, { expiresIn: '1h' });
console.log(token);
