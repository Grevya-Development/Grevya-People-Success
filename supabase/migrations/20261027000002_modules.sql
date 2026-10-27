-- People Success: module tables

-- Organisation "today" in India Standard Time
create or replace function public.org_today()
returns date language sql stable as $$
  select (now() at time zone 'Asia/Kolkata')::date
$$;

-- ---------------------------------------------------------------------------
-- HRIS
-- ---------------------------------------------------------------------------
create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  title text not null,
  contract_type text not null default 'employment'
    check (contract_type in ('employment','nda','consultant','internship','vendor','other')),
  start_date date not null,
  end_date date,
  status text not null default 'active' check (status in ('draft','active','expired','terminated','renewed')),
  terms text,
  document_url text,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.letters (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  letter_type text not null check (letter_type in
    ('offer','appointment','confirmation','experience','relieving','address_proof','employment_verification','salary_certificate','increment','bonus','promotion','other')),
  category text not null default 'general' check (category in ('general','salary')),
  title text not null,
  content text not null,
  issued_on date not null default current_date,
  issued_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.letter_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  letter_type text not null,
  purpose text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  letter_id uuid references public.letters(id) on delete set null,
  approver_id uuid references public.employees(id) on delete set null,
  approver_remarks text,
  actioned_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.policies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'General',
  summary text,
  content text not null,
  version text not null default '1.0',
  effective_date date not null default current_date,
  requires_acknowledgement boolean not null default false,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.policy_acknowledgements (
  policy_id uuid not null references public.policies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (policy_id, employee_id)
);

create table public.faqs (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'General',
  question text not null,
  answer text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Leave
-- ---------------------------------------------------------------------------
create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  annual_quota numeric(5,1) not null default 0,
  is_paid boolean not null default true,
  carry_forward boolean not null default false,
  allow_half_day boolean not null default true,
  color text not null default '#f97316',
  active boolean not null default true,
  sort_order int not null default 0
);

create table public.leave_balances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id) on delete cascade,
  year int not null,
  allocated numeric(5,1) not null default 0,
  used numeric(5,1) not null default 0,
  unique (employee_id, leave_type_id, year)
);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id),
  start_date date not null,
  end_date date not null,
  half_day boolean not null default false,
  half_day_session text check (half_day_session in ('first','second')),
  days numeric(5,1) not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  approver_id uuid references public.employees(id) on delete set null,
  approver_remarks text,
  actioned_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index on public.leave_requests (employee_id, start_date);

create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date date not null,
  type text not null default 'public' check (type in ('public','optional')),
  location_id uuid references public.locations(id) on delete cascade,
  unique (date, name)
);

-- ---------------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------------
create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  date date not null,
  check_in timestamptz,
  check_out timestamptz,
  status text not null default 'present'
    check (status in ('present','absent','half_day','on_duty','wfh')),
  work_mode text not null default 'office' check (work_mode in ('office','remote')),
  source text not null default 'web' check (source in ('web','mobile','regularization','system')),
  notes text,
  created_at timestamptz not null default now(),
  unique (employee_id, date)
);

create table public.regularization_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  date date not null,
  request_type text not null default 'missed_punch'
    check (request_type in ('missed_punch','wfh','on_duty','wrong_punch')),
  check_in timestamptz not null,
  check_out timestamptz not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  approver_id uuid references public.employees(id) on delete set null,
  approver_remarks text,
  actioned_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.compoff_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  worked_date date not null,
  days numeric(3,1) not null default 1 check (days in (0.5, 1)),
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  expires_on date,
  approver_id uuid references public.employees(id) on delete set null,
  approver_remarks text,
  actioned_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Payroll
-- ---------------------------------------------------------------------------
create table public.salary_structures (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  effective_from date not null,
  annual_ctc numeric(12,2) not null,
  basic numeric(12,2) not null,           -- annual amounts
  hra numeric(12,2) not null,
  special_allowance numeric(12,2) not null,
  fbp_total numeric(12,2) not null default 0,
  pf_employer numeric(12,2) not null default 0,
  gratuity numeric(12,2) not null default 0,
  variable_pay numeric(12,2) not null default 0,
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.payslips (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  year int not null,
  month int not null check (month between 1 and 12),
  earnings jsonb not null default '[]',     -- [{label, amount}]
  deductions jsonb not null default '[]',   -- [{label, amount}]
  gross numeric(12,2) not null,
  total_deductions numeric(12,2) not null,
  net_pay numeric(12,2) not null,
  working_days numeric(4,1) not null default 0,
  paid_days numeric(4,1) not null default 0,
  lop_days numeric(4,1) not null default 0,
  status text not null default 'published' check (status in ('draft','published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (employee_id, year, month)
);

create table public.vpf_declarations (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  financial_year text not null,
  percentage numeric(5,2) not null check (percentage >= 0 and percentage <= 88),
  effective_month date not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  approver_id uuid references public.employees(id) on delete set null,
  approver_remarks text,
  actioned_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.fbp_declarations (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  financial_year text not null,
  components jsonb not null default '[]',  -- [{code, label, limit, declared}]
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected')),
  approver_id uuid references public.employees(id) on delete set null,
  approver_remarks text,
  submitted_at timestamptz,
  actioned_at timestamptz,
  created_at timestamptz not null default now(),
  unique (employee_id, financial_year)
);

create table public.investment_declarations (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  financial_year text not null,
  regime text not null default 'new' check (regime in ('old','new')),
  items jsonb not null default '[]',       -- [{section, label, declared, proof_amount}]
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected')),
  approver_id uuid references public.employees(id) on delete set null,
  approver_remarks text,
  submitted_at timestamptz,
  actioned_at timestamptz,
  created_at timestamptz not null default now(),
  unique (employee_id, financial_year)
);

-- ---------------------------------------------------------------------------
-- Reimbursement
-- ---------------------------------------------------------------------------
create table public.claim_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null default 'expense' check (kind in ('expense','ctc')),
  max_amount numeric(12,2),
  requires_receipt boolean not null default true,
  active boolean not null default true
);

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  employee_id uuid not null references public.employees(id) on delete cascade,
  category_id uuid not null references public.claim_categories(id),
  title text not null,
  expense_date date not null,
  amount numeric(12,2) not null check (amount > 0),
  description text,
  receipt_path text,
  status text not null default 'submitted'
    check (status in ('draft','submitted','approved','rejected','paid','cancelled')),
  approver_id uuid references public.employees(id) on delete set null,
  approver_remarks text,
  actioned_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Performance
-- ---------------------------------------------------------------------------
create table public.review_cycles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'goal_setting'
    check (status in ('draft','goal_setting','in_review','closed')),
  created_at timestamptz not null default now()
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete cascade,  -- null = organisation objective
  cycle_id uuid references public.review_cycles(id) on delete set null,
  parent_goal_id uuid references public.goals(id) on delete set null,
  title text not null,
  description text,
  category text not null default 'business' check (category in ('business','development','behavioral','organisation')),
  weightage numeric(5,2) not null default 0,
  target text,
  progress int not null default 0 check (progress between 0 and 100),
  status text not null default 'draft'
    check (status in ('draft','pending_approval','approved','rejected','completed')),
  due_date date,
  created_by uuid references public.employees(id) on delete set null,
  approver_id uuid references public.employees(id) on delete set null,
  approver_remarks text,
  actioned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.goal_updates (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  author_id uuid not null references public.employees(id) on delete cascade,
  progress int check (progress between 0 and 100),
  comment text not null,
  created_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.review_cycles(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  reviewer_id uuid references public.employees(id) on delete set null,
  self_rating numeric(2,1) check (self_rating between 1 and 5),
  self_comments text,
  self_strengths text,
  self_improvements text,
  manager_rating numeric(2,1) check (manager_rating between 1 and 5),
  manager_comments text,
  final_rating numeric(2,1) check (final_rating between 1 and 5),
  status text not null default 'pending_self' check (status in ('pending_self','pending_manager','completed')),
  self_submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (cycle_id, employee_id)
);

-- ---------------------------------------------------------------------------
-- Exit
-- ---------------------------------------------------------------------------
create table public.resignations (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  reason_category text not null,
  reason text not null,
  resignation_date date not null default current_date,
  requested_last_day date not null,
  approved_last_day date,
  notice_period_days int not null default 60,
  status text not null default 'pending_manager'
    check (status in ('pending_manager','pending_hr','approved','rejected','withdrawn','completed')),
  manager_remarks text,
  manager_action_at timestamptz,
  hr_remarks text,
  hr_action_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index one_open_resignation on public.resignations (employee_id)
  where status in ('pending_manager','pending_hr','approved');

create table public.exit_clearances (
  id uuid primary key default gen_random_uuid(),
  resignation_id uuid not null references public.resignations(id) on delete cascade,
  department text not null,
  status text not null default 'pending' check (status in ('pending','cleared')),
  remarks text,
  cleared_by uuid references public.employees(id) on delete set null,
  cleared_at timestamptz,
  unique (resignation_id, department)
);

-- ---------------------------------------------------------------------------
-- Learning
-- ---------------------------------------------------------------------------
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null default 'Technical',
  provider text not null default 'Internal',
  level text not null default 'beginner' check (level in ('beginner','intermediate','advanced')),
  duration_hours numeric(5,1) not null default 1,
  content_url text,
  modules jsonb not null default '[]',   -- [{title, duration_minutes}]
  is_mandatory boolean not null default false,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.course_enrollments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  assigned_by uuid references public.employees(id) on delete set null,
  status text not null default 'enrolled' check (status in ('enrolled','in_progress','completed')),
  progress int not null default 0 check (progress between 0 and 100),
  due_date date,
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (course_id, employee_id)
);

-- ---------------------------------------------------------------------------
-- Recruit
-- ---------------------------------------------------------------------------
create table public.job_openings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department_id uuid references public.departments(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  employment_type text not null default 'full_time',
  experience_min int not null default 0,
  experience_max int not null default 5,
  description text not null,
  requirements text,
  openings int not null default 1,
  status text not null default 'open' check (status in ('open','on_hold','closed')),
  referral_bonus numeric(12,2) not null default 0,
  hiring_manager_id uuid references public.employees(id) on delete set null,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.job_openings(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  current_company text,
  experience_years numeric(4,1),
  resume_path text,
  linkedin_url text,
  source text not null default 'referral' check (source in ('referral','portal','agency','direct')),
  referred_by uuid references public.employees(id) on delete set null,
  stage text not null default 'applied'
    check (stage in ('applied','screening','interview','offer','hired','rejected')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  interviewer_id uuid not null references public.employees(id) on delete cascade,
  round_name text not null default 'Technical',
  scheduled_at timestamptz not null,
  mode text not null default 'video' check (mode in ('video','in_person','phone')),
  feedback text,
  rating int check (rating between 1 and 5),
  result text not null default 'pending' check (result in ('pending','pass','fail')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- More apps: helpdesk, declarations, add-ons
-- ---------------------------------------------------------------------------
create table public.helpdesk_tickets (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  employee_id uuid not null references public.employees(id) on delete cascade,
  category text not null,
  subject text not null,
  description text not null,
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  assigned_to uuid references public.employees(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.helpdesk_tickets(id) on delete cascade,
  author_id uuid not null references public.employees(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.declaration_forms (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  fields jsonb not null default '[]',   -- [{key, label, type: text|textarea|number|date|select|checkbox, options?, required}]
  due_date date,
  active boolean not null default true,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.declaration_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.declaration_forms(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  responses jsonb not null default '{}',
  submitted_at timestamptz not null default now(),
  unique (form_id, employee_id)
);

create table public.addons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  url text not null,
  color text not null default '#2563eb',
  sort_order int not null default 0,
  active boolean not null default true
);

create trigger contracts_updated_at before update on public.contracts for each row execute function public.set_updated_at();
create trigger policies_updated_at before update on public.policies for each row execute function public.set_updated_at();
create trigger goals_updated_at before update on public.goals for each row execute function public.set_updated_at();
create trigger candidates_updated_at before update on public.candidates for each row execute function public.set_updated_at();
create trigger tickets_updated_at before update on public.helpdesk_tickets for each row execute function public.set_updated_at();
