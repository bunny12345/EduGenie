# RLS Smoke Test Guide

## Generated Test Tokens

### Teacher Token
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0ZmFlNjFiOS05MjIxLTQzNmEtODAwMy1kN2ZkMGNjNjUzNzgiLCJyb2xlIjoidGVhY2hlciIsImlhdCI6MTc4MzYzNjIzNSwiZXhwIjoxNzgzNjM5ODM1fQ.DxMuRmrDSFkl-cQqy8DU0yFvmbgHR1TxzAyZs480M1Y
```
**Claims**: 
- `sub`: 4fae61b9-9221-436a-8003-d7fd0cc65378 (teacher ID)
- `role`: teacher
- `schoolId`: b994994e-355c-435e-b28f-8e3d1c24d12b

### Student Token
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmODNjNDRmYy1kNTdmLTQ4ZjktOTU1Mi0yY2NmZWU0ZjRhZWQiLCJyb2xlIjoic3R1ZGVudCIsImlhdCI6MTc4MzYzNjI0MiwiZXhwIjoxNzgzNjM5ODQyfQ.33eUcHVWSTndmtU2bmL0_1tV07SPSXB0ydGCz2gKdUM
```
**Claims**: 
- `sub`: f83c44fc-d57f-48f9-9552-2ccfee4f4aed (student ID: Bunny)
- `role`: student

---

## Manual RLS Test Options

### Option A: Test via Supabase SQL Editor (Simplest)

1. Open Supabase → SQL Editor
2. Paste and run this to set teacher claims:

```sql
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'role', 'teacher',
    'sub', '4fae61b9-9221-436a-8003-d7fd0cc65378',
    'schoolId', 'b994994e-355c-435e-b28f-8e3d1c24d12b'
  )::text,
  true
);

-- These should return only teacher-filtered rows:
SELECT id, name, school_id, teacher_id FROM public.students LIMIT 10;
SELECT id, login_id, school_id, teacher_id FROM public.student_accounts LIMIT 10;
```

Expected: Teacher should see students/accounts where `school_id` matches their school AND (`teacher_id` is null OR `teacher_id` matches their ID).

3. Then set student claims:

```sql
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'role', 'student',
    'sub', 'f83c44fc-d57f-48f9-9552-2ccfee4f4aed'
  )::text,
  true
);

-- Student should see only their own row:
SELECT id, name, school_id FROM public.students;
SELECT id, student_id FROM public.student_accounts;
```

Expected: Only 1 row (the student's own record).

---

### Option B: Test via API with curl

1. Start backend: `cd backend && PORT=8000 npm run dev`
2. Run one-command API smoke test (recommended):

```bash
cd backend
TEACHER_TOKEN="<teacher_token>" STUDENT_TOKEN="<student_token>" npm run smoke:rls-api
```

Expected status summary from this command:
- `teacher_status=200`
- `student_status=200`
- `student_on_teacher_status=403` (student denied on teacher list)
- `teacher_on_school_status=403` (teacher denied on school-admin endpoint)

3. Or run manual endpoint checks:
4. Test teacher access to student list:

```bash
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0ZmFlNjFiOS05MjIxLTQzNmEtODAwMy1kN2ZkMGNjNjUzNzgiLCJyb2xlIjoidGVhY2hlciIsImlhdCI6MTc4MzYzNjIzNSwiZXhwIjoxNzgzNjM5ODM1fQ.DxMuRmrDSFkl-cQqy8DU0yFvmbgHR1TxzAyZs480M1Y" \
  http://localhost:8000/teacher/students
```

Expected: Returns students in teacher's school with their class scope.

5. Test student access:

```bash
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmODNjNDRmYy1kNTdmLTQ4ZjktOTU1Mi0yY2NmZWU0ZjRhZWQiLCJyb2xlIjoic3R1ZGVudCIsImlhdCI6MTc4MzYzNjI0MiwiZXhwIjoxNzgzNjM5ODQyfQ.33eUcHVWSTndmtU2bmL0_1tV07SPSXB0ydGCz2gKdUM" \
  http://localhost:8000/dashboard?studentId=f83c44fc-d57f-48f9-9552-2ccfee4f4aed
```

Expected: Returns this student's dashboard payload for the requested `studentId` (for this test: Bunny).

6. Optional boundary checks:

```bash
# Student token must be denied on teacher endpoint
curl -i -H "Authorization: Bearer <student_token>" \
  http://localhost:8000/teacher/students

# Teacher token must be denied on school-admin-only endpoint
curl -i -H "Authorization: Bearer <teacher_token>" \
  http://localhost:8000/school/dashboard
```

Expected: both return `403`.

---

### Option C: Login via Web App

1. Start both servers:
   - `cd backend && npm run dev` (background)
   - `cd web && npm start` (background)

2. Open http://localhost:3000
3. Click **Teacher Login** → Use any email/password (system creates account on first login with proper role)
4. Frontend should use generated teacher token
5. Verify you see **only** students in your school + class
6. Logout and login as student → verify you see only your data

---

## What "Pass" Looks Like

✅ **Teacher Query Results:**
- Schools: 1 row (their own school)
- Teachers: 1 row (themselves) 
- Students: 2-4 rows (Bunny, Test_01, others in their school/class, excluding null-school rows)
- Student Accounts: 4+ rows (linked to their students)

✅ **Student Query Results:**
- Schools: 0 rows (students can't see schools)
- Teachers: 0 rows (students can't see teachers)
- Students: 1 row (only Bunny)
- Student Accounts: 1+ row (Bunny's accounts)

---

## Debugging If Results Are Wrong

1. **All rows visible** → RLS policies not executing; check:
   - Is `relforcerowsecurity` TRUE on all 4 tables?
   - Do JWT claims have correct `role`, `sub`, `schoolId`?

2. **No rows visible** → RLS too strict; check policy USING/WITH CHECK clauses match JWT structure

3. **Unexpected rows** → Policy logic issue; review [2026-07-09-auth-hierarchy-rls.sql](./migrations/2026-07-09-auth-hierarchy-rls.sql) for scoping

