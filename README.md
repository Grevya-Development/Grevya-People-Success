# People Success

Grevya's employee portal — HRIS, Performance, Exit, Leave, Attendance, Payroll, Reimbursement, Learning, Recruit, Directory, Declarations, Onboarding and an Admin console for HR. The HR Helpdesk now lives in the Service Desk app when `NEXT_PUBLIC_SERVICE_DESK_URL` is set.

**Stack:** Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · Supabase (Postgres, Auth, Storage, Row Level Security).

## Run locally

Requirements: Node 20+, Docker (OrbStack / Docker Desktop).

```bash
npm install
npm run db:start            # local Supabase on ports 554xx (Studio: http://127.0.0.1:55423)
npm run seed                # demo organisation (add -- --reset to wipe & reseed)
npm run dev                 # http://localhost:3100
```

Demo logins (local / demo data only, password `Grevya@123`):

| Login | Role | Lands on |
|---|---|---|
| `admin@grevya.com` | Super admin (accounts & roles) | Admin console |
| `hr@grevya.com` | HR admin | Admin console |
| `kavin@grevya.com` | Manager | Employee home |
| `priya@grevya.com` | Employee | Employee home |

Every seeded employee can sign in with `<firstname>@grevya.com`. Production users get a temporary password from HR (or a reset link) and must choose their own at first sign-in; HR can disable a login in **User Accounts & Roles**, which signs the person out.

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

## Gia — the in-portal assistant

The purple **Gia** button (bottom-right) answers HR questions: leave balance, holidays, payslips, attendance, pending requests, policies and FAQs, and where to find any page. It only reads data the signed-in person is already allowed to see.

- Without configuration it uses built-in quick answers.
- Add `ANTHROPIC_API_KEY` to `.env.local` (and your host's environment) to switch on AI answers powered by Claude (`claude-opus-5-5` by default; override with `ASSISTANT_MODEL`). Each question costs a small amount of API usage.

## How access works

Security is enforced in the database (Row Level Security + triggers), not just the UI:

- **Employees** see and act on their own records.
- **Managers** (anyone with reports) also see and approve their reporting chain.
- **HR admins** (`role = 'hr_admin'`) see and manage everything; **super admins** (`role = 'super_admin'`) also manage user accounts and roles. People who have left lose HR and manager rights automatically.
- Approval statuses can only be set by an approver; side effects (leave balance updates, attendance on regularization approval, comp-off credits, exit clearance, notifications) run as database triggers.

## Admin console

HR admins and super admins sign in to the **Admin console** (`/admin`) instead of the employee home. It has an admin-only menu (People, Time & Leave, Payroll & Expenses, Performance, Recruitment & Learning, Documents & Forms, Communication & Settings) and an organisation dashboard: headcount trend, attendance today, workforce mix, leave and claims charts, payroll cost, hiring pipeline, reviews, learning, approvals waiting, probation, onboarding, joiners and leavers.

Admins are employees too: **My workspace** (header, sidebar user menu or mobile menu) switches to their own leave, payslips and requests, and **Admin console** switches back. The choice is kept in the `ps_view` cookie.

HR adds people in **Admin console → People → Employees** and can create their login there. Anyone who signs up with an email that matches an employee record is linked automatically.

## Project layout

```
supabase/migrations/      schema, RLS policies, workflow triggers
scripts/seed.mts          demo / minimal seed
src/proxy.ts              session refresh + auth redirect
src/lib/                  supabase clients, auth helpers, nav map, utils
src/components/ui/        UI kit
src/components/shell/     header, sidebar flyouts, search, notifications, view switch
src/app/(portal)/admin/   admin console dashboard, accounts, org, announcements, add-ons
src/app/(portal)/<module> one folder per module (pages, actions.ts, _components)
docs/CONVENTIONS.md       coding conventions
```


## Email notifications (Resend)

Every in-app notification (approvals, leave decisions, payslips, letters, tickets, …) is queued on
`public.notifications` and emailed through Resend from `peoplesuccess.grevya.com`: batches of up to 100,
idempotency keys, retries (1, 5, 15, 60 min; 5 attempts), and a personal on/off switch in **Settings**.
The database pings `/api/email/dispatch` right after each notification (pg_net) and every minute (pg_cron);
the target URL lives in `public.app_private_settings` (`email_dispatch_url`, default the production URL).
Notifications copied in from the Service Desk are skipped (the desk emails those itself). Notifications that
existed before email was enabled are never sent; outside production only `EMAIL_DEV_ALLOWLIST` recipients get mail.

Setup: `npm run db:push` (applies the migration), then set `RESEND_API_KEY` and `EMAIL_FROM` in Vercel and redeploy.
