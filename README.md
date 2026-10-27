# People Success

Grevya's employee portal — HRIS, Performance, Exit, Leave, Attendance, Payroll, Reimbursement, Learning, Recruit, Directory, HR Helpdesk, Declarations and an HR Admin console.

**Stack:** Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · Supabase (Postgres, Auth, Storage, Row Level Security).

## Run locally

Requirements: Node 20+, Docker (OrbStack / Docker Desktop).

```bash
npm install
npm run db:start            # local Supabase on ports 554xx (Studio: http://127.0.0.1:55423)
npm run seed                # demo organisation (add -- --reset to wipe & reseed)
npm run dev                 # http://localhost:3100
```

Demo logins (password `Grevya@123`): `hr@grevya.com` (HR admin), `kavin@grevya.com` (manager), `priya@grevya.com` (employee). Every seeded employee can sign in with `<firstname>@grevya.com`.

## Connect your hosted Supabase project

1. Push the schema:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push          # applies supabase/migrations/*
   ```
2. Put your keys in `.env.local` (see `.env.example`):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon / publishable key>
   SUPABASE_SERVICE_ROLE_KEY=<service role key>   # server only
   ```
3. Seed either the demo org (`npm run seed`) or just reference data + your first HR admin:
   ```bash
   ADMIN_EMAIL=you@grevya.com ADMIN_PASSWORD='choose-one' ADMIN_NAME='Your Name' npm run seed -- --minimal
   ```
4. In Supabase → Authentication → URL configuration, set the Site URL to your deployed URL and add `<your-url>/auth/callback` to redirect URLs (used by password reset).

### This project

`.env.local` already points at the hosted project `oxhhwasktpgxwccwbypa` (region ap-southeast-2) and includes `SUPABASE_DB_URL`, so:

```bash
npm run dev                        # app on http://localhost:3100 using the hosted DB
set -a; . ./.env.local; set +a
npm run db:push                    # apply any new migrations to the hosted DB
npm run smoke -- hr@grevya.com     # request every page as a role (dev server must be running)
```

## How access works

Security is enforced in the database (Row Level Security + triggers), not just the UI:

- **Employees** see and act on their own records.
- **Managers** (anyone with reports) also see and approve their reporting chain.
- **HR admins** (`role = 'hr_admin'`) see and manage everything.
- Approval statuses can only be set by an approver; side effects (leave balance updates, attendance on regularization approval, comp-off credits, exit clearance, notifications) run as database triggers.

HR adds people in **HR Admin → Employees** and can create their login there. Anyone who signs up with an email that matches an employee record is linked automatically.

## Project layout

```
supabase/migrations/      schema, RLS policies, workflow triggers
scripts/seed.mts          demo / minimal seed
src/proxy.ts              session refresh + auth redirect
src/lib/                  supabase clients, auth helpers, nav map, utils
src/components/ui/        UI kit
src/components/shell/     header, sidebar flyouts, search, notifications
src/app/(portal)/<module> one folder per module (pages, actions.ts, _components)
docs/CONVENTIONS.md       coding conventions
```
