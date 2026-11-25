# AcademiX — Copilot Instructions

Use this file as durable project context, not as a live deployment/status dashboard. Check the current source, worktree, and official console/docs when behavior or release status may have changed.

## Project Overview

AcademiX serves students, teachers, and school administrators through a React web app and a Flutter mobile app, backed by NestJS and Supabase. The web app also has an owner portal. The mobile app currently supports student and teacher flows; the school-admin role is not implemented as a native portal.

```text
web/          React SPA (Create React App)
backend/      NestJS API (TypeScript)
mobile/       Flutter app
backend/db/   Database migrations and SQL policies
infra/aws/    Terraform and deployment tooling
```

### Navigation and app boundaries

- The web app does not use React Router. Role dashboards use component state synchronized with `window.location.hash`; login and logout clear the hash. The owner portal is selected by the `/owner` pathname. Check `web/src/App.js` before changing routing.
- The student, teacher, and school dashboards are intentionally large, established components. Do not split them into route-based pages or replace the hash navigation without explicit instruction.
- Web API wrappers live in `web/src/api.js`. Inspect each endpoint's actual request and response shape; do not assume every endpoint has the same response envelope.
- Backend API routes are explicitly routed through CloudFront in `infra/aws/`. When adding or renaming a backend route, verify its prefix is routed to the backend origin; routing is not automatic.

## Critical Data, Security, and Compatibility Rules

- Supabase is production data. Schemas and migrations live under `backend/db/`. Never drop, rename, or alter existing tables without explicit approval.
- Never disable or rewrite RLS policies. Review the migrations as well as `backend/db/rls_policies.sql`; that SQL file is not necessarily the complete/current policy inventory.
- Preserve `SupabaseService` behavior. It uses `SUPABASE_SERVICE_ROLE_KEY` when configured, can fall back to the anon key, and uses file-backed mock persistence (`backend/local-data/mock-store.json`) when Supabase configuration is unavailable. Do not replace or silently change these fallbacks. Avoid committing local data, uploaded user content, `.env` files, API keys, or other secrets.
- Preserve the chat `conversationId` format: `conv-<student>:subject-<subject>:lesson-<id>`.
- Authentication is not identical on every endpoint. Most protected controllers use `AuthGuard`, school/teacher endpoints add role checks, owner endpoints use owner authorization, and some endpoints (such as health and public support intake) are intentionally public. Follow the existing route's intended access policy; do not add blanket guards or make routes public without checking callers and requirements.
- Do not remove or change `DISABLE_SESSION_EXPIRY_GUARD` without explicit instruction. Session-expiry handling is currently disabled in the web app/API; verify current behavior before changing it.
- Do not expose credentials or copy values from environment files into code, docs, logs, or chat.

## Web Portals

### Student

- Keep the persistent student sidebar (`.eg-sidebar`) and its responsive behavior. Do not remove or hide it except through existing responsive rules.
- The current sidebar includes **Report Card** (not the older “Mock Tests” label); games and mock tests can still appear in subject/content flows. Check `StudentDashboard.jsx` before relying on an old navigation list.
- `activeSidebarTab` and `activeView` control the student panels and subject-specific views. The AI Tutor is integrated into the student experience, not a separate route.
- A separate floating Quick Sam assistant also exists (`QuickSamBubble.jsx`); do not conflate it with the inline AI Tutor.
- AI Tutor features include lesson-aware chat and additional learning modes/voice UI. Preserve lesson scoping, prompt boundaries, and conversation persistence when changing tutor behavior.

### Teacher and school administrator

- Teacher and school portals remain web dashboards with their existing sidebars and hash-based section persistence. Preserve the current class/school scoping and server-side filtering.
- Teacher test authoring supports the existing create/edit/clone and question-management flows; keep dependent API behavior consistent.
- School administrators manage teachers/invites, curriculum, students, and class filters. Preserve invite-link registration and tenant scoping.

## Teacher Homework Autocorrection

- Homework assignment has separate student-facing instructions/question (`note`) and teacher-only AI marking guidance (`gradingGuidance`). Keep the guidance editor collapsed by default in web/mobile; the prefilled subject-aware rubric remains in state and is always applied server-side. Teachers can expand it to append assignment-specific criteria. Never merge the rubric into the student-visible note.
- The rubric is stored in existing homework metadata; do not add a table/column or migration for it. Teacher APIs may return it so teachers can edit it, but student-facing homework, dashboard, and Sam responses must not expose it.
- AI correction retrieves indexed `lesson_chunks` for linked units, or automatically searches the signed-in teacher's curriculum for the assignment subject when no unit is linked. It semantically/lexically ranks chunks from the assignment title and instructions and includes source unit/document/page labels. Unit titles alone are not textbook content; do not claim textbook verification without retrieved text.
- The default rubric requires concept-and-reasoning checks, step-by-step mathematics marking, subject-appropriate language/science/social-studies marking, evidence-based partial credit, specific learner-facing feedback, and manual review when material is insufficient. Preserve this rubric when changing the prompt; teachers may append textbook key points, expected answers, or partial-credit rules.
- Autocorrect only suggests a score and feedback. Keep the existing teacher review/edit/submit step; never publish an AI grade automatically.

### Owner

- The owner portal is a separate web entry selected at `/owner`; retain its route and authorization boundary when changing app-level routing.

## Web Design, Loading, and Student Activity

- Main styles are in `web/src/App.css`, but component styles also exist in files such as `StudentGames.css`, `StudentOrchard.css`, `StudentProgress.css`, and `CurriculumContent.css`; check for existing styles before adding or moving CSS.
- Student styles commonly use `eg-`; school/teacher styles use `sd-` / `td-`. Preserve established visual patterns and responsive behavior.
- Do not show a generic “Loading…” message for background portal data loads. Use the existing silent-loading pattern; user-initiated actions may show progress, and panel errors must remain visible.
- Streaks represent real activity, not login alone. Preserve the existing qualifying activity sources and the rewards check-in behavior when editing streak/reward logic; verify the implementation before changing its rules.

## Flutter Mobile App

- Mobile intentionally uses native bottom navigation, not the web sidebars. Do not add a sidebar/drawer to imitate web.
- State management uses Riverpod; HTTP requests use Dio through `mobile/lib/services/api_client.dart`. Keep bearer-token handling centralized there.
- `state/session_provider.dart` restores the session from secure storage and coordinates the API token; `navigation/role_router.dart` restores/routs supported roles. Verify current source before assuming a role is supported.
- Student navigation currently uses **Home / Services / More** (not the old five-tab layout); AI Tutor is reachable from the student experience. Check the shell before describing or changing tab structure.
- The mobile teacher Home includes announcements, homework assignment/edit/delete, and mock-test flows; Students includes roster, submission review, and teacher-controlled grading with AI suggestions. The AI suggestion is not published until the teacher reviews and submits it. Verify each other tab in its current screen before describing it as complete. Do not build out the school-admin native portal unless explicitly asked; school-admin mobile sessions receive a web-only notice/sign-out flow.
- Student and teacher light/dark theme preferences are persisted separately; the app has light and dark Material themes, and AI Tutor has its own dark palette. Preserve saved preferences when changing defaults or theme controls.
- Push-notification initialization and session behavior are part of startup/auth flows; review these before changing app initialization or logout.
- The student More page and teacher menu include installed-version/update UI. Update checks and the Google Play in-app update flow are Android-specific; do not promise an update mechanism on other platforms.
- Web contracts remain the reference when implementing mobile API calls. Verify API base URL configuration in `mobile/lib/config/env.dart`, the web environment, and deployment settings before diagnosing missing or mismatched data. Do not change a default URL based on assumption.
- Mobile README (`mobile/README.md`) describes current features and known rollout/testing considerations. Read it before adding features or treating an area as complete.

## Backend and Deployment

- NestJS controllers are in `backend/src/controllers/`; module registration is in `backend/src/app.module.ts`. Many controllers are registered directly by `AppModule`; follow nearby conventions rather than assuming every feature has its own module.
- School and teacher routes generally combine `AuthGuard` with explicit role checks. Preserve school/grade/class scoping.
- Supabase integration is in `backend/src/supabase.service.ts`. Local mock persistence uses files under `backend/local-data/`; do not assume local fallback data is in-memory or disposable.
- New API paths may require changes to the explicit CloudFront backend route-prefix configuration in `infra/aws/variables.tf`. Check routing and deployment configuration together with the controller and web API wrapper.
- Production web builds must use the API URL intended for production. Check `infra/aws/deploy.sh` and current deployment configuration; do not bake a developer-local `.env.local` API URL into a production build. Verify the configured backend health endpoint before diagnosing cross-app data issues.
- Never claim a Play Console release is published, a review is complete, or a testing period has elapsed without checking the current Play Console status. Release and testing state changes over time.

## Tests and Build Commands

Run the narrowest relevant check first. Check each package's README/package scripts for current commands.

```bash
# Backend type-check
cd backend && npx tsc --noEmit

# Focused backend Node test (replace the test path with the relevant file)
cd backend && TS_NODE_TRANSPILE_ONLY=1 node --test -r ts-node/register src/auth/password-reset.test.ts

# Web tests (Create React App)
cd web && CI=true npm test -- --watchAll=false

# Web production build
cd web && CI=true npm run build

# Flutter static analysis and tests
cd mobile && flutter analyze && flutter test
```

- Web `package.json` does not define a lint script. Do not invent a lint command or attribute existing warnings to a change without comparing against the baseline.
- Backend tests use Node's test runner; there is no general `npm test` script in the backend package.
- For mobile release builds, verify signing, versioning, API configuration, and the intended Play track before building or uploading. Never publish/upload a release unless the user explicitly asks.

## Things Copilot Must Not Do

1. Remove or hide a web portal sidebar except through its established responsive behavior.
2. Drop/rename/alter Supabase tables or weaken/rewrite RLS without explicit user approval.
3. Change the chat `conversationId` format.
4. Change auth/session expiry behavior or remove `DISABLE_SESSION_EXPIRY_GUARD` without explicit instruction.
5. Install a client-side router or replace hash-based web portal navigation without explicit instruction.
6. Split dashboard components into route-based pages without explicit instruction.
7. Remove or rewrite invite-link registration or weaken tenant/class scoping.
8. Add web-style sidebars to mobile.
9. Treat mobile teacher placeholder tabs as completed features, or build the mobile school-admin portal, unless explicitly asked.
10. Change API base URLs, deployment routing, or the Supabase fallback based on assumption.
11. Show generic “Loading…” text for silent background loads.
12. Include secrets, personal tester credentials, or environment-file values in source or documentation.

## File Quick Reference

| Purpose | Path |
|---|---|
| Web entry, role routing, session | `web/src/App.js` |
| Web student portal | `web/src/components/StudentDashboard.jsx` |
| Web teacher portal | `web/src/components/TeacherDashboard.jsx` |
| Web school portal | `web/src/components/SchoolDashboard.jsx` |
| Floating Quick Sam | `web/src/components/QuickSamBubble.jsx` |
| Web API wrappers | `web/src/api.js` |
| Web shared styles | `web/src/App.css` |
| Mobile entry | `mobile/lib/main.dart` |
| Mobile role routing | `mobile/lib/navigation/role_router.dart` |
| Mobile student shell | `mobile/lib/navigation/student_nav_shell.dart` |
| Mobile teacher shell | `mobile/lib/navigation/teacher_shell.dart` |
| Mobile session state | `mobile/lib/state/session_provider.dart` |
| Mobile API client/config | `mobile/lib/services/api_client.dart` / `mobile/lib/config/env.dart` |
| Backend module registration | `backend/src/app.module.ts` |
| Backend Supabase integration | `backend/src/supabase.service.ts` |
| Backend auth service | `backend/src/auth/student-auth.service.ts` |
| Backend controllers | `backend/src/controllers/` |
| DB migrations and policies | `backend/db/` |
| AWS infrastructure/deploy | `infra/aws/` |
