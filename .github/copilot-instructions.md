# AcademiX — Copilot Instructions

## Project Overview

AcademiX is a school/teacher/student portal with an integrated AI Tutor. It has three user roles, each with its own dashboard. The backend is NestJS + Supabase (PostgreSQL with RLS). The web frontend is React (CRA). There is also a Flutter mobile app (early stage).

## Architecture

```
web/          React SPA (Create React App, no router — hash-based navigation)
backend/      NestJS (TypeScript), deployed independently
mobile/       Flutter app — Student portal complete, Teacher portal complete,
              School Admin portal not yet started (see "Mobile App" section below)
supabase/     Supabase project config
```

- **No React Router.** Navigation is driven by component state synced to `window.location.hash`. On login the hash is cleared so users always land on the home/overview page.
- **Single-file dashboards.** Each portal is one large component: `StudentDashboard.jsx`, `TeacherDashboard.jsx`, `SchoolDashboard.jsx`. Do not split them into separate route-based pages without explicit instruction.
- **API layer:** `web/src/api.js` contains all fetch wrappers. Endpoints return `{ success: true, ...payload }` envelopes.

## Supabase Rules (CRITICAL)

- Supabase is the production database. All table schemas, RLS policies, and migrations live in `backend/db/`.
- **Never drop or alter existing tables** without explicit user approval.
- **Never disable or rewrite RLS policies** — they enforce multi-tenant isolation.
- `SupabaseService` (backend) uses `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` env vars. When those are missing, a local mock DB is used. Do not change this fallback behavior.
- Chat persistence uses `conversationId` scoped keys. Do not change the conversation ID format (`conv-<student>:subject-<subject>:lesson-<id>`).

## Three Portals

### Student Portal (`StudentDashboard.jsx`)

- **Sidebar (MUST REMAIN):** A persistent left sidebar (`<aside className="eg-sidebar">`) with navigation items: Home, My Orchard, Games, AI Tutor, Homework, Mock Tests, Progress, Calendar, Rewards, Library, Settings.
- **Do not remove or hide the sidebar** except via the existing responsive `@media (max-width: 1100px)` collapse.
- `activeSidebarTab` controls which panel is shown; `activeView` controls home vs. subject-specific views.
- The AI Tutor panel renders inline when `activeSidebarTab === 'AI Tutor'`.
- Subject-specific pages show homework, tests, and lessons for one subject.

### Teacher Portal (`TeacherDashboard.jsx`)

- Sidebar with sections: teacher overview, curriculum upload, students, tests.
- Teachers are scoped to a school and assigned grades/classes.
- Test authoring supports create, edit, clone, add/edit/delete questions.

### School Admin Portal (`SchoolDashboard.jsx`)

- Sidebar with sections: overview, teacher registration, teachers & invites, curriculum upload, student registration, students.
- Has class filter dropdowns for teachers and students (server-side filtering via `className` query param).
- Admin can register teachers/students, create invite links, manage curriculum.

## Sidebar & Navigation Rules

1. The sidebar is the primary navigation in all three portals. Never remove it.
2. Hash-based persistence: the active section is stored in `window.location.hash` so browser refresh stays on the same page.
3. On login (`handleLogin`) and logout (`handleLogout`), the hash is cleared so the user always starts at the default home/overview page.

## AI Tutor

- Lives inside `StudentDashboard.jsx` as a chat panel (not a separate route).
- Scoped to a selected subject + optional lesson.
- Sends a hidden "lesson onboarding" message once per lesson to trigger a warm intro.
- Lesson-mode prompt is strict: the PDF is the teaching boundary, off-topic is redirected.
- Follow-up chip suggestions are lesson-aware.
- Voice playback via TTS endpoint.

## Design & CSS Rules

- All CSS is in `web/src/App.css` (single file). Class prefix: `eg-` for student portal, `sd-` / `td-` for school/teacher.
- Glass-effect cards use `.eg-home-glass` on the student home page.
- Dark sidebar gradient: `var(--sidebar)` to `var(--sidebar-2)`.
- No "Loading..." text visible to users — use silent background loading pattern (see below).

## Silent Loading Pattern

- Portals load data in the background. No "Loading…" text is ever shown on screen.
- Only user-initiated actions show feedback (Save/Upload/Refresh spinners, AI typing dots).
- `panelError.*` messages are always shown.
- Baseline lint warnings: exactly 8 pre-existing (4 StudentDashboard, 4 TeacherDashboard). Do not introduce more.

## Streaks & Rewards

- Streak counts days with real activity: homework submissions, test attempts, progress_metrics rows, orchard_activity, or student_rewards check-ins.
- Login alone does NOT count as streak activity.
- The "Check-in (+10 coins)" button in Rewards earns coins and should also count for streak (via `student_rewards` table).
- Weekly goal is `min(streakDays, 7) / 7 * 100%`.

## Mobile App (Flutter)

The Flutter app (`mobile/`) is a native client for the same three portals, calling the identical NestJS backend/API contracts as web. `web/src/api.js` remains the canonical source of every endpoint's request/response shape — mirror it in Dart, don't invent new contracts.

- **State management:** Riverpod (`flutter_riverpod`, no codegen — `Provider`/`NotifierProvider`/`FutureProvider.autoDispose`).
- **HTTP client:** Dio, wrapped in `mobile/lib/services/api_client.dart` (bearer token injected via interceptor).
- **Session:** `flutter_secure_storage` (key `academix_session`), mirrors web's `AcademiX.session` shape. `state/session_provider.dart` is the single source of truth; `navigation/role_router.dart` dispatches to the right shell (student/teacher/school) by role, mirroring `App.js`.
- **No sidebar on mobile.** This intentionally overrides the web sidebar rule — Flutter uses native bottom nav per portal instead. Web is the functional/branding reference for mobile (colors, features, copy), not the layout reference.
- **API base URL parity is critical:** `mobile/lib/config/env.dart`'s `Env.apiBaseUrl` must point at the same backend web is using (check `web/.env.local`'s `REACT_APP_API_URL`) or student/teacher data silently looks "missing" between the two apps — this has been the single most common mobile/web data-mismatch bug. Verify both with `curl <url>/health` before assuming an app bug, and never assume the current default is correct without checking.

### Student portal (mobile) — feature-complete
`navigation/student_nav_shell.dart` (5-tab bottom nav: Home / Learn / AI Tutor / Tasks / More) plus a 9-icon "Academics" grid on Home (exact mirror of web's `eg-academ-grid`, same GIF icons under `mobile/assets/gifs/`) linking to every other section: Homework, My Orchard, Mock Tests, Progress, Games, Calendar, Rewards, Library, Settings. Screens live under `mobile/lib/screens/student/`.

- Every section mirrors web's real design/colors (not a simplified generic mobile version).
- AI Tutor (`screens/student/student_ai_tutor_screen.dart`) has its own bespoke **dark theme** (`theme/ai_tutor_colors.dart`, ported 1:1 from web's `.eg-ai-panel` CSS) — the only dark-themed screen in the app — plus Quiz Rush, Explain Back, Story Mode, and voice ("Talk to Sam", via `record`/`audioplayers`), matching web feature-for-feature. Same `conversationId` format as web — do not change it.
- Games (`screens/student/games/`): hub + all 3 live catalog games (Flashcards, Quiz Rush, Memory Maze) fully playable, mirroring `StudentGames.jsx`.
- Progress (`screens/student/progress/`): full "Learning Report" mirror (gauge, radar chart, growth trend charts via hand-rolled `CustomPainter`s, no chart package) reading `GET /progress/learning-score`.
- Homework (`screens/student/homework/`): per-subject view mirroring web exactly (filters, history calendar, image attach/lightbox, resubmission window).
- Shared reusable primitives — reuse these, don't re-invent per screen: `widgets/section_card.dart` (`SectionCard`/`SkeletonBox`/`ErrorInline`), `widgets/pressable_scale.dart` (`PressableScale`, the "3D button" tactile press effect used across cards/buttons), `widgets/coming_soon_view.dart` (never a bare "Loading...", follows the same silent-loading rule as web).
- Known deferred/simplified items — do not "fix" unless asked: homework image drag-to-reorder, flashcard "Ask AI to explain" cross-tab deep link, Orchard chapter drill-down, full month calendar view.

### Teacher portal (mobile) — just completed
`navigation/teacher_shell.dart` — bottom nav mirrors `TeacherDashboard.jsx`'s sidebar sections: Home, AI Assistant, Students, Progress (`screens/teacher/teacher_*_tab.dart`).

### School Admin portal (mobile) — not started
`navigation/school_shell.dart` is still a placeholder (`ComingSoonView`) — session/logout work, no real UI yet. Do not build this out unless explicitly asked.

### Mobile-only gotchas (full history in repo memory `mobile-app-plan.md`)
- New/changed `pubspec.yaml` `assets:` entries need a full stop + relaunch of `flutter run`, not hot reload/restart.
- `flutter run -d web-server` does not hot-reload a manually-opened browser tab without the Dart Debug Chrome extension attached — kill and relaunch for every change when using that target.
- `Row`/`Column` with `CrossAxisAlignment.stretch` inside a scrollable/unbounded parent needs `IntrinsicHeight`, or restructure with plain nested `Container`s instead.
- Android SDK / Xcode are not installed on the dev machine — verification is `flutter analyze` + `flutter test` only (no on-device/simulator run available).

## Backend Conventions

- Controllers are in `backend/src/controllers/`.
- Auth guard: `@UseGuards(AuthGuard)` on all controllers.
- Role check: `ensureSchoolAdmin(req)` / `ensureTeacher(req)` per endpoint.
- Student auth service: `backend/src/auth/student-auth.service.ts` — has local in-memory fallback for accounts when DB inserts fail.
- Dev token generation: `node backend/scripts/make_dev_token.js <id> <role>`.
- Type-check: `cd backend && npx tsc --noEmit`.

## Things Copilot Must NOT Do

1. Remove or hide the sidebar in any portal.
2. Drop, rename, or alter Supabase tables without explicit approval.
3. Change RLS policies.
4. Show "Loading..." text to users (use silent pattern).
5. Install a client-side router (React Router, etc.) — use hash-based state.
6. Split dashboard components into separate files/routes without instruction.
7. Change the `conversationId` key format for chat scoping.
8. Remove the `DISABLE_SESSION_EXPIRY_GUARD` flag without instruction.
9. Remove or rewrite the invite-link registration flow.
10. Change how `handleLogin`/`handleLogout` clear the hash.
11. Add a sidebar/drawer to the mobile (Flutter) app for parity with web — mobile intentionally uses native bottom nav instead.
12. Change `mobile/lib/config/env.dart`'s default API base URL without first confirming which backend web (`web/.env.local`) is currently pointed at.
13. Build out the School Admin mobile portal (`school_shell.dart`) beyond its current placeholder unless explicitly asked.

## Build & Verify Commands

```bash
# Backend type-check
cd backend && npx tsc --noEmit

# Web production build
cd web && CI=true npx react-scripts build

# Generate dev tokens
cd backend && set -a && source .env && set +a && node scripts/make_dev_token.js <id> <role>

# Mobile analyze + test (no device/simulator available on this machine)
cd mobile && flutter analyze && flutter test
```

## File Quick Reference

| Purpose | Path |
|---------|------|
| App entry + role routing | `web/src/App.js` |
| Student portal | `web/src/components/StudentDashboard.jsx` |
| Teacher portal | `web/src/components/TeacherDashboard.jsx` |
| School admin portal | `web/src/components/SchoolDashboard.jsx` |
| Login/role selection | `web/src/components/RoleGateway.jsx` |
| All API calls | `web/src/api.js` |
| All CSS | `web/src/App.css` |
| Auth service | `backend/src/auth/student-auth.service.ts` |
| School controller | `backend/src/controllers/school.controller.ts` |
| Teacher controller | `backend/src/controllers/teacher.controller.ts` |
| Dashboard controller | `backend/src/controllers/dashboard.controller.ts` |
| DB migrations | `backend/db/migrations/` |
| RLS policies | `backend/db/rls_policies.sql` |
| Mobile entry + role routing | `mobile/lib/main.dart` + `mobile/lib/navigation/role_router.dart` |
| Mobile student shell | `mobile/lib/navigation/student_nav_shell.dart` |
| Mobile teacher shell | `mobile/lib/navigation/teacher_shell.dart` |
| Mobile school shell (placeholder) | `mobile/lib/navigation/school_shell.dart` |
| Mobile API client / env config | `mobile/lib/services/api_client.dart` / `mobile/lib/config/env.dart` |
