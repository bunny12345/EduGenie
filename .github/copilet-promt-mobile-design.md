now want to begin implementing the AcademiX mobile application based on the web platform that is already implemented in this repository.

The mobile application already exists in early-stage form under:

mobile/

and it is built using Flutter.

The existing production-style web application is under:

web/

The web application should be treated as the main functional and visual reference, but I do not want the mobile application to simply be a compressed copy of the desktop website.

Your role for this work is to act as both:

1. Senior Flutter mobile developer
2. Mobile UI/UX designer

Primary goal

Build a polished, modern, production-quality AcademiX mobile application by mirroring the functionality, branding, user flows and overall design language of the existing web application, while redesigning layouts and interactions where necessary to make them appropriate for native mobile screens.

The mobile experience should feel like it was intentionally designed for iOS/Android rather than a desktop website squeezed onto a phone.

Before making any changes

First inspect the current implementation.

Review:

web/src/App.js

web/src/App.css

web/src/components/StudentDashboard.jsx

web/src/components/TeacherDashboard.jsx

web/src/components/SchoolDashboard.jsx

web/src/components/RoleGateway.jsx

web/src/api.js

and the current Flutter application under:

mobile/

Also inspect the relevant backend endpoints before implementing API integrations.

Do not immediately start rewriting files.

First understand:

the existing AcademiX design system
layouts
navigation
portal structure
API contracts
authentication
student features
teacher features
school admin features
AI Tutor behaviour
existing Flutter structure
which mobile screens/features already exist

Then create an implementation plan.

Important principle

The web application is the source of truth for functionality, but not necessarily for mobile layout.

Preserve the same:

branding
terminology
feature set
data
backend APIs
business rules
authentication model
role permissions

But redesign the presentation where necessary for mobile.

For example, a desktop sidebar should not automatically become a narrow mobile sidebar.

Use appropriate mobile navigation patterns such as:

bottom navigation
navigation drawer
tab navigation
nested screens
bottom sheets
modal sheets
floating action buttons
swipeable cards
collapsible sections

Choose whichever pattern gives the best UX for each feature.

AcademiX mobile design direction

The application should feel:

modern
premium
friendly for students
professional enough for schools
visually polished
clean
engaging
uncluttered
consistent with the AcademiX web application

Do not redesign the brand completely.

Reuse/adapt existing:

colours
typography style
gradients
card styling
icons
spacing philosophy
subject colours
progress visuals
orchard/gamification style
AI Tutor identity

But improve anything that does not translate well to mobile.

Student mobile experience

The Student app is the highest priority.

The existing web Student portal contains:

Home
My Orchard
Games
AI Tutor
Homework
Mock Tests
Progress
Calendar
Rewards
Library
Settings

Do not assume all eleven items need to appear permanently in bottom navigation.

Design a sensible mobile information architecture.

For example, primary destinations could be something similar to:

Home
Learn / Subjects
AI Tutor
Tasks
More

and secondary features can live inside those sections.

This is only an example. Inspect the existing application and choose the UX that makes the most sense.

Student Home screen

Transform the existing student dashboard into a mobile-first home experience.

It should surface the most useful information first, such as:

greeting/student identity
current streak
coins/rewards
today's learning goal
continue learning
subjects
homework due
upcoming mock tests
AI Tutor quick access
progress
orchard/gamification status
upcoming calendar items

Do not overload one mobile screen.

Use cards, horizontal scrolling sections and progressive disclosure where appropriate.

Subjects

Subject cards should remain visually recognisable from the web application.

Opening a subject should provide a native mobile subject screen containing relevant:

lessons
homework
tests
progress
AI Tutor access

Do not reproduce desktop multi-column layouts if stacked/nested mobile screens provide better usability.

AI Tutor

The AI Tutor is one of the most important features of the AcademiX app.

The existing behaviour must remain compatible with the web implementation.

Preserve:

selected subject context
selected lesson context
lesson onboarding
conversation persistence
follow-up suggestions
lesson boundaries
TTS/voice functionality
existing conversationId format

Do not modify the conversation ID format.

Design the AI Tutor as an excellent mobile chat experience.

Consider:

full-screen tutor view
sticky message input
voice button
speaker/TTS controls
lesson context header
suggestion chips
typing state
keyboard handling
safe area handling
smooth scrolling

If the existing animated AI tutor/character can later be integrated, structure the UI so that such a character can be incorporated cleanly without redesigning the whole screen.

Homework

Design homework for mobile using clear cards and dedicated detail screens.

Students should easily see:

subject
title
due date
completion state
instructions
submission status

Prioritise overdue and upcoming homework appropriately.

Mock Tests

Create a mobile test-taking experience rather than directly copying the web layout.

Consider:

one question at a time or carefully grouped questions
progress indicator
next/previous controls
answer state
timer where applicable
review before submission
result summary

Make accidental test submission difficult.

Progress

Adapt desktop graphs/statistics for small screens.

Use clear mobile visualisations for:

subject progress
completion
streak
tests
homework performance
learning activity

Avoid squeezing desktop charts onto the screen.

My Orchard / Rewards

The orchard and rewards system is an important part of the student experience.

Make it highly visual and engaging on mobile.

Preserve the existing progression concept and reward logic.

Do not change backend reward/streak rules unless explicitly required.

Remember:

Login alone does not count as streak activity.

Teacher application

After the Student experience is stable, adapt the Teacher portal.

Important functionality includes:

teacher overview
classes
students
curriculum
assignments/homework
tests
student progress

Teacher screens should be productivity-focused rather than simply copies of the student UI.

School Admin application

Then adapt the School Admin portal.

Important functionality includes:

overview
teachers
teacher registration
invitations
curriculum
students
student registration
class filters
school management

School Admin screens can be denser than Student screens but must remain easy to operate on a phone.

Backend / API requirements

Do not create duplicate business logic inside Flutter when it already exists in the backend.

The Flutter app should integrate with the existing AcademiX backend.

Reuse existing API behaviour wherever possible.

Before calling an endpoint, inspect:

web/src/api.js

and the corresponding NestJS controller/service.

Do not:

alter database schemas without approval
drop tables
modify RLS policies
weaken authentication
change tenant isolation
change existing API contracts unnecessarily
Mobile architecture

Keep the Flutter project maintainable.

Do not put the entire application into one huge Dart file.

Use sensible separation for things such as:

screens
widgets
models
services/API
state
navigation
theme
shared UI components

However, do not perform unnecessary architectural rewrites of existing Flutter code if a clean structure already exists.

Prefer improving the current project incrementally.

Responsive/device requirements

The app should work properly on:

smaller Android phones
larger Android phones
modern iPhones
devices with notches/dynamic islands
devices using gesture navigation

Handle:

safe areas
keyboard overlap
scrolling
long text
accessibility scaling
loading states
empty states
errors
network failures

Avoid hardcoded layouts that only work on one device size.

Loading UX

Follow the AcademiX principle of avoiding ugly generic:

Loading...

screens.

Use appropriate:

skeletons
shimmer placeholders
subtle progress indicators
button-level progress
background refresh

AI responses may use typing indicators.

UI quality expectations

Pay close attention to:

spacing
card radius
shadows
typography hierarchy
icon consistency
button sizing
touch targets
alignment
screen transitions
empty states
keyboard behaviour
scrolling
visual hierarchy

Avoid excessive gradients, excessive shadows or overly decorative UI.

The result should look like a professionally designed commercial education app.

Very important

Do not modify the existing web application simply to make mobile development easier.

The current website should continue functioning independently.

Only modify shared/backend functionality when genuinely required and explain why before doing so.

Implementation approach

Do this incrementally.

Phase 1

Inspect the repository and current Flutter implementation.

Then tell me:

What already exists in mobile/
What can be reused
What is missing
What web components/features map to which Flutter screens
Your recommended mobile navigation structure
Your proposed Student mobile UI architecture
Which files you plan to modify/create

Do not make large implementation changes yet.

Phase 2

After the architecture is understood, start implementing the mobile foundation:

app theme
navigation
reusable widgets
authentication/session handling
role handling
API layer
Phase 3

Implement the Student portal first.

Start with:

Student Home
Subjects
AI Tutor
Homework
Mock Tests
Progress
Orchard
Rewards
Calendar
Library
Settings

Complete and verify each major section before moving to the next.

Phase 4

Implement Teacher mobile experience.

Phase 5

Implement School Admin mobile experience.

Verification

After changes, run appropriate Flutter checks such as:

cd mobile
flutter pub get
flutter analyze

and where practical:

flutter test

Do not leave new analyzer errors.

If an existing error is unrelated to your changes, clearly identify it instead of silently changing unrelated functionality.

Final instruction

You have freedom to make mobile-specific UI/UX improvements, but not freedom to change AcademiX business logic, permissions, database rules or important feature behaviour.

Whenever there is a choice between:

copying the desktop UI exactly

and

preserving the same function while creating a significantly better mobile experience

choose the better mobile experience.

Start by inspecting the repository and current mobile/ project.

Do not implement everything immediately. First give me your mobile architecture and UI/UX implementation plan based on the actual code that currently exists.