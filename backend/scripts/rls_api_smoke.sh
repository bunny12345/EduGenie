#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8000}"
STUDENT_ID="${STUDENT_ID:-f83c44fc-d57f-48f9-9552-2ccfee4f4aed}"
TEACHER_TOKEN="${TEACHER_TOKEN:-}"
STUDENT_TOKEN="${STUDENT_TOKEN:-}"

if [[ -z "$TEACHER_TOKEN" || -z "$STUDENT_TOKEN" ]]; then
  echo "Usage: TEACHER_TOKEN=<token> STUDENT_TOKEN=<token> $0"
  echo "Optional: BASE_URL=http://localhost:8000 STUDENT_ID=<uuid>"
  exit 1
fi

teacher_raw="$(curl -sS -w '\n%{http_code}' -H "Authorization: Bearer $TEACHER_TOKEN" "$BASE_URL/teacher/students")"
teacher_status="$(printf '%s' "$teacher_raw" | tail -n 1)"
teacher_body="$(printf '%s' "$teacher_raw" | sed '$d')"

student_raw="$(curl -sS -w '\n%{http_code}' -H "Authorization: Bearer $STUDENT_TOKEN" "$BASE_URL/dashboard?studentId=$STUDENT_ID")"
student_status="$(printf '%s' "$student_raw" | tail -n 1)"
student_body="$(printf '%s' "$student_raw" | sed '$d')"

# Boundary check: student token must not access teacher-only endpoint.
student_on_teacher_raw="$(curl -sS -w '\n%{http_code}' -H "Authorization: Bearer $STUDENT_TOKEN" "$BASE_URL/teacher/students")"
student_on_teacher_status="$(printf '%s' "$student_on_teacher_raw" | tail -n 1)"

# Boundary check: teacher token must not access school-admin-only endpoint.
teacher_on_school_raw="$(curl -sS -w '\n%{http_code}' -H "Authorization: Bearer $TEACHER_TOKEN" "$BASE_URL/school/dashboard")"
teacher_on_school_status="$(printf '%s' "$teacher_on_school_raw" | tail -n 1)"

echo "teacher_status=$teacher_status"
echo "student_status=$student_status"
echo "student_on_teacher_status=$student_on_teacher_status"
echo "teacher_on_school_status=$teacher_on_school_status"

if [[ "$teacher_status" != "200" ]]; then
  echo "FAIL: teacher endpoint returned $teacher_status"
  exit 2
fi

if [[ "$student_status" != "200" ]]; then
  echo "FAIL: student dashboard endpoint returned $student_status"
  exit 3
fi

if [[ "$student_on_teacher_status" == "200" ]]; then
  echo "FAIL: authorization boundary broken: student token accessed /teacher/students"
  exit 6
fi

if [[ "$teacher_on_school_status" == "200" ]]; then
  echo "FAIL: authorization boundary broken: teacher token accessed /school/dashboard"
  exit 7
fi

if ! printf '%s' "$teacher_body" | grep -q '"success":true'; then
  echo "FAIL: teacher response missing success=true"
  echo "$teacher_body"
  exit 4
fi

if ! printf '%s' "$student_body" | grep -q '"dashboard"'; then
  echo "FAIL: student response missing dashboard payload"
  echo "$student_body"
  exit 5
fi

echo "PASS: API smoke checks succeeded"
