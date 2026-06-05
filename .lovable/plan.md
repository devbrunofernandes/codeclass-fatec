
# CodeClass — Implementation Plan

A virtual-classroom platform for programming courses. Teachers create classrooms, invite students/collaborators, post materials, and assign three task types (Coding Challenge, Trivia, Questionnaire). Students solve coding tasks in an in-browser editor, run code through an external sandbox, and receive AI-powered pedagogical feedback. Teachers review submissions and send graded returns. A real-time chat connects users.

## Scope confirmed
- Build the full RF/RNF spec in one delivery.
- Code execution via external API (Piston public API — no key required).
- AI review via Lovable AI Gateway.
- Emails via Resend (token confirmation, classroom invites).
- RF031 anti-paste: soft warning (toast) when paste detected.

---

## 1. Backend (Lovable Cloud)

### Auth
- Email + password signup. Role chosen at signup: `teacher` or `student`.
- Email confirmation by 6-digit token (RF025) — stored in `email_tokens` table; expires in 30 min (RNF008); resend invalidates prior (RF026). Custom flow on top of Supabase auth (sign up creates unconfirmed account; user enters token to flip a `email_confirmed` flag and complete login).
- Login by username OR email (RF002).
- Unique username + email (RNF007).
- Password hashing handled by Supabase (RNF003). LGPD: minimal PII, deletion on request (RNF004).

### Schema (Postgres + RLS + GRANTs)
- `profiles` (id → auth.users, full_name, username UNIQUE, email UNIQUE, email_confirmed, created_at).
- `user_roles` (id, user_id, role enum `teacher|student`) + `has_role()` SECURITY DEFINER.
- `email_tokens` (id, user_id, token, expires_at, used).
- `classrooms` (id, owner_id, name, subject, description, chat_private bool, archived).
- `classroom_members` (classroom_id, user_id, role enum `owner|collaborator|student`, joined_at).
- `classroom_invites` (id, classroom_id, email, role, token, status enum `pending|accepted|declined`, created_at).
- `materials` (id, classroom_id, title, file_path, size, uploaded_by). Storage bucket `materials`, 30 MB cap (RNF013).
- `tasks` (id, classroom_id, type enum `coding|trivia|quiz`, title, statement, due_at, created_by, config jsonb).
  - coding config: `starter_code`, `allowed_languages[]`.
  - trivia config: `questions[{prompt, options[], correct_index, time_limit_sec}]`.
  - quiz config: `questions[{type: alt|essay, prompt, options?, correct_index?}]`.
- `submissions` (id, task_id, student_id, content jsonb, language?, submitted_at, status, grade, teacher_feedback, ai_feedback jsonb).
- `notifications` (id, user_id, type, payload, read_at).
- `messages` (id, classroom_id|recipient_id, sender_id, body, created_at, edited_at). Supabase Realtime for RNF006.

All tables: explicit GRANTs + RLS scoped via `has_role` and membership.

### Server functions (`createServerFn`, TanStack)
- Auth: `signUp`, `confirmEmail`, `resendToken`.
- Classrooms: `create`, `archive`, `listMine`, `getDetail`, `invite` (sends email + notification), `acceptInvite`, `declineInvite`.
- Materials: `upload` (signed URL ≤30MB), `list`, `download`.
- Tasks: `createCoding|createTrivia|createQuiz`, `list`, `getForStudent`, `getForTeacher`.
- Submissions: `submit`, `runCode` (calls Piston, 3s timeout, RNF011), `requestAiReview`, `teacherReturn` (grade + comment).
- Chat: `sendMessage`, `editMessage`, `listMessages` (Realtime subscription on client).

### Server routes
- `src/routes/api/public/piston-proxy.ts` — proxies to `https://emkc.org/api/v2/piston/execute` with 3 s wallTimeout, language whitelist (JS, Python, Java, C, C++ — RNF009).
- AI route used by `requestAiReview` server fn: Lovable AI Gateway → `google/gemini-3-flash-preview`. System prompt: pedagogical Portuguese review (correctness, readability, complexity, suggestions). Returns structured JSON. Pop-up error on failure (RF030).

### Email (Resend connector)
- Templates: confirmation token (RF018/RF025), classroom invite student (RF020), invite collaborator (RF021).
- Server fn `sendEmail` wraps gateway POST.

---

## 2. Frontend (TanStack Start + Tailwind + shadcn)

### Routes
- `/` — marketing landing (brief CodeClass pitch + login CTA).
- `/auth/sign-up`, `/auth/login`, `/auth/confirm` (token input + resend).
- `/_authenticated/` — gated layout (redirects to `/auth/login` if no session).
  - `/dashboard` — role-aware home.
    - Teacher: classrooms grid, "Create classroom" button.
    - Student: pending tasks (RF014) sorted by due date, classrooms list.
  - `/classrooms/$id` — tabs: Stream, Materials, Tasks, People, Chat.
  - `/classrooms/$id/tasks/new` — task type picker → form per type.
  - `/classrooms/$id/tasks/$taskId` —
    - Student view: depends on type.
    - Teacher view: submissions list → review panel.
  - `/tasks/coding/$submissionId` — full coding editor screen (Monaco) with: language picker, Run, Submit, AI feedback panel, paste-warning toast (RF031).
  - `/invites/$token` — accept/decline.
  - `/notifications`.
- `/reset-password`.

### Key UI components
- Monaco editor with syntax highlighting (RF012), paste handler emits warning toast (RF031), language selector (RNF009).
- Run output panel: stdout/stderr/exit + execution time.
- AI feedback panel: rendered markdown sections (Pontos fortes, Pontos de melhoria, Complexidade, Sugestões).
- Trivia runner: one question at a time with countdown timer per question; question order randomized.
- Quiz runner: linear form (alternativas + dissertativas).
- Real-time chat panel using Supabase Realtime.
- Notifications bell with badge.

### Design system
- Update `src/styles.css` with a programming-friendly palette (dark + light tokens). Suggested vibe: midnight indigo accent, monospace headings sparingly. Confirm with you on first iteration if desired.

---

## 3. Cross-cutting

- Responsive (RNF002) — Tailwind breakpoints throughout.
- TanStack Query for all reads; loaders use `ensureQueryData`.
- All protected server fns use `requireSupabaseAuth` middleware; `attachSupabaseAuth` registered in `src/start.ts`.
- Error/notFound boundaries on every route per template rules.
- SEO `head()` on every page.

---

## 4. Delivery order (single build, internal sequencing)

1. Enable Lovable Cloud, schema + RLS + grants.
2. Auth (signup, token confirm, login, roles).
3. Classrooms + invites + member management + emails.
4. Materials (storage + upload/list).
5. Tasks (all 3 types) + submission models.
6. Coding editor + Piston proxy + Run.
7. AI review integration.
8. Teacher review/devolutiva.
9. Real-time chat + notifications.
10. Dashboard polish, responsive pass, SEO, error boundaries.

---

## Technical notes
- Piston public API is rate-limited (~5 req/s). Acceptable for MVP; can switch to self-hosted/Judge0 later.
- AI structured output via `Output.object` (zod schema) for stable parsing.
- Email confirmation token: 6-digit numeric, hashed in DB.
- RF031: `onPaste` in Monaco shows toast "Cole detectado — recomendamos digitar o código" but does NOT block.
- Storage bucket `materials` private; downloads via signed URL.
- Classroom chat privacy flag toggles whether students can post or only read.

---

## Out-of-scope clarifications (assumed unless you object)
- No payments / no plans.
- No mobile native app.
- Initial UI in Portuguese (matches spec).
- "Colaboradores" treated as co-teachers with all teacher permissions inside that classroom (spec doesn't define their permission set).
- Trivia "tempo para responder" applies per question; timeout auto-submits empty.
- Code execution language list fixed to RNF009 set (overrides RF019 "todas").

Confirm or adjust and I'll switch to build mode.
