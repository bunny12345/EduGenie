RLS policy guide — EduGenie

Overview
- This file contains Row Level Security (RLS) SQL snippets to scope student data to the authenticated user.
- Policies use `auth.uid()` which returns the user's id from the JWT. Ensure your tokens set the student id as the `sub` claim.

How to apply
1. Open the Supabase project dashboard → SQL Editor.
2. Paste the contents of `rls_policies.sql` and run it as an admin (or use psql with a service role key).
   - Example psql:
     psql "$DATABASE_URL" -f rls_policies.sql

Notes & best practices
- Test policies in a staging DB before applying to production.
- Service-role keys bypass RLS — use them only server-side for admin tasks like backups or batch re-embed jobs.
- For teacher/parent roles you may need additional policies that allow read-only access to related student rows; add role checks like `auth.role() = 'teacher'` or maintain a mapping table (e.g., `class_members`) and check membership in the USING clause.
- If you use Supabase Auth, verify that `auth.uid()` returns the expected student id (or adjust policies to use `current_setting('request.jwt.claims', true)` if you need special claims).

If you want, I can generate guarded policy variants for teacher/parent roles and provide psql/terraform snippets to apply them.
 
Teacher / Parent variants
- See `rls_policies_roles.sql` for example policies that add a `class_members` mapping table and allow teachers/parents access to student rows when they are mapped to that student. Steps:
  1. Run `rls_policies_roles.sql` in the SQL editor as an admin.
  2. Maintain `class_members` from your admin UI or sync process so teachers/parents are linked to students.

