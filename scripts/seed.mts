/**
 * People Success seed.
 *
 *   npm run seed              demo organisation (18 employees + data in every module)
 *   npm run seed -- --reset   wipe ALL app data and demo logins first, then seed demo
 *   npm run seed -- --minimal reference data only + the first Super Admin login
 *                             (set ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME env vars)
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const args = new Set(process.argv.slice(2));
const PASSWORD = "Grevya@123";

// ---------- helpers ----------
type Row = Record<string, unknown>;
async function ins<T = Row>(table: string, rows: Row | Row[], select = "*"): Promise<T[]> {
  const { data, error } = await db.from(table).insert(rows, { defaultToNull: false }).select(select);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data as T[];
}
async function upd(table: string, values: Row, match: Row) {
  const { error } = await db.from(table).update(values).match(match);
  if (error) throw new Error(`${table} update: ${error.message}`);
}

let seed = 20261027;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));

const IST = "+05:30";
function todayIST() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}
function addDays(d: string, n: number) {
  const x = new Date(d + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
function dow(d: string) {
  return new Date(d + "T00:00:00Z").getUTCDay();
}
const isWeekend = (d: string) => dow(d) === 0 || dow(d) === 6;
function ts(date: string, h: number, m: number) {
  return `${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00${IST}`;
}

// ---------- reset ----------
const ALL_TABLES = [
  "remote_work_sessions", "ticket_comments", "helpdesk_tickets", "declaration_responses", "declaration_forms", "addons",
  "interviews", "candidates", "job_openings", "course_enrollments", "courses",
  "exit_clearances", "resignations", "goal_updates", "reviews", "goals", "review_cycles",
  "claims", "claim_categories", "investment_declarations", "fbp_declarations", "vpf_declarations", "payslips", "salary_structures",
  "compoff_requests", "regularization_requests", "attendance_records", "holidays", "leave_requests", "leave_balances", "leave_types",
  "faqs", "policy_acknowledgements", "policies", "letter_requests", "letters", "contracts",
  "org_settings", "announcements", "notifications", "favorites",
  "employee_experience", "employee_education", "employee_private", "employees",
  "locations", "designations", "departments",
];

async function reset() {
  console.log("Resetting data…");
  // break manager self-references first
  await db.from("employees").update({ manager_id: null }).not("id", "is", null);
  for (const t of ALL_TABLES) {
    const key = t === "policy_acknowledgements" ? "policy_id" : t === "org_settings" ? "key" : t === "employee_private" ? "employee_id" : "id";
    const { error } = await db.from(t).delete().not(key, "is", null);
    if (error) throw new Error(`reset ${t}: ${error.message}`);
  }
  for (const bucket of ["documents", "attendance-photos", "avatars"]) await emptyBucket(bucket);
  let page = 1;
  for (;;) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) if (u.email?.endsWith("@grevya.com")) await db.auth.admin.deleteUser(u.id);
    if (data.users.length < 200) break;
    page++;
  }
}

/** Remove every object in a storage bucket (walks folders). */
async function emptyBucket(bucket: string, prefix = "") {
  for (;;) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error || !data || data.length === 0) return;
    const files = data.filter((o) => o.id).map((o) => (prefix ? `${prefix}/${o.name}` : o.name));
    const folders = data.filter((o) => !o.id).map((o) => (prefix ? `${prefix}/${o.name}` : o.name));
    for (const f of folders) await emptyBucket(bucket, f);
    if (files.length) await db.storage.from(bucket).remove(files);
    if (files.length < 1000) return;
  }
}

async function createLogin(email: string, password: string) {
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error && !/already/i.test(error.message)) throw new Error(`auth ${email}: ${error.message}`);
  if (data?.user) {
    // trigger links by email; make sure in case the employee row came later
    await db.from("employees").update({ user_id: data.user.id }).eq("email", email).is("user_id", null);
  }
}

// ---------- reference data ----------
async function seedReference() {
  const { count } = await db.from("leave_types").select("id", { count: "exact", head: true });
  if (count) {
    console.log("Reference data already present — skipping.");
    return;
  }
  await ins("leave_types", [
    { code: "CL", name: "Casual Leave", annual_quota: 8, color: "#f97316", sort_order: 1 },
    { code: "SL", name: "Sick Leave", annual_quota: 8, color: "#ef4444", sort_order: 2 },
    { code: "EL", name: "Earned Leave", annual_quota: 15, carry_forward: true, allow_half_day: false, color: "#22c55e", sort_order: 3 },
    { code: "COMP", name: "Comp Off", annual_quota: 0, color: "#8b5cf6", sort_order: 4 },
    { code: "LOP", name: "Loss of Pay", annual_quota: 0, is_paid: false, color: "#64748b", sort_order: 5 },
    { code: "ML", name: "Maternity / Paternity Leave", annual_quota: 0, allow_half_day: false, color: "#ec4899", sort_order: 6 },
  ]);
  await ins("claim_categories", [
    { name: "Travel", kind: "expense", max_amount: 50000 },
    { name: "Food & Meals", kind: "expense", max_amount: 5000 },
    { name: "Internet & Mobile", kind: "expense", max_amount: 3000 },
    { name: "Client Entertainment", kind: "expense", max_amount: 20000 },
    { name: "Office Supplies", kind: "expense", max_amount: 10000 },
    { name: "Learning & Certification", kind: "expense", max_amount: 40000 },
    { name: "Relocation", kind: "expense", max_amount: 100000 },
    { name: "Other", kind: "expense", max_amount: 10000, requires_receipt: true },
    { name: "Fuel & Conveyance", kind: "ctc" },
    { name: "Telephone & Internet", kind: "ctc" },
    { name: "Meal Card", kind: "ctc", requires_receipt: false },
    { name: "Books & Periodicals", kind: "ctc" },
    { name: "Leave Travel Allowance", kind: "ctc" },
    { name: "Uniform/Gadget", kind: "ctc" },
  ]);
  await ins("org_settings", [
    { key: "attendance", value: { shift_start: "09:30", shift_end: "18:30", grace_minutes: 15, min_full_day_hours: 8 } },
    { key: "company", value: { name: "Grevya", portal: "People Success", address: "Grevya Technologies Pvt. Ltd., Bengaluru, Karnataka, India" } },
  ]);
  const holidays: [string, string, string][] = [
    ["2026-01-01", "New Year's Day", "optional"],
    ["2026-01-15", "Makar Sankranti / Pongal", "public"],
    ["2026-01-26", "Republic Day", "public"],
    ["2026-03-04", "Holi", "optional"],
    ["2026-03-19", "Ugadi", "public"],
    ["2026-04-03", "Good Friday", "public"],
    ["2026-05-01", "May Day", "public"],
    ["2026-08-15", "Independence Day", "public"],
    ["2026-09-14", "Ganesh Chaturthi", "public"],
    ["2026-10-02", "Gandhi Jayanti", "public"],
    ["2026-10-20", "Vijayadashami", "public"],
    ["2026-11-10", "Deepavali", "public"],
    ["2026-11-27", "Kanakadasa Jayanti", "optional"],
    ["2026-12-25", "Christmas", "public"],
    ["2027-01-01", "New Year's Day", "optional"],
    ["2027-01-15", "Makar Sankranti / Pongal", "public"],
    ["2027-01-26", "Republic Day", "public"],
    ["2027-03-22", "Holi", "optional"],
    ["2027-03-26", "Good Friday", "public"],
  ];
  await ins("holidays", holidays.map(([date, name, type]) => ({ date, name, type })));
}

// ---------- minimal ----------
async function seedMinimal() {
  await seedReference();
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? "HR Admin";
  if (!email || !password) {
    console.log("Set ADMIN_EMAIL and ADMIN_PASSWORD to also create the first HR admin.");
    return;
  }
  const [first, ...rest] = name.split(" ");
  const { data: existing } = await db.from("employees").select("id").eq("email", email).maybeSingle();
  if (!existing) {
    const [dept] = await ins<{ id: string }>("departments", { name: "Human Resources", code: "HR" });
    const [emp] = await ins<{ id: string }>("employees", {
      employee_code: "GRV0001", first_name: first, last_name: rest.join(" "), email, role: "super_admin", department_id: dept.id,
    });
    await ins("employee_private", { employee_id: emp.id });
  }
  await createLogin(email, password);
  console.log(`Super Admin ready: ${email}`);
}

// ---------- demo ----------
type Emp = { id: string; email: string; first_name: string; full_name: string; manager_id: string | null; date_of_joining: string; role: string };

async function seedDemo() {
  const { count } = await db.from("employees").select("id", { count: "exact", head: true });
  if (count) {
    console.log("Employees already exist. Run with --reset to wipe and reseed.");
    return;
  }
  await seedReference();
  const today = todayIST();
  const year = Number(today.slice(0, 4));

  const depts = await ins<{ id: string; code: string }>("departments", [
    { name: "Leadership", code: "LDR" },
    { name: "Gen AI", code: "GAI" },
    { name: "Engineering", code: "ENG" },
    { name: "Human Resources", code: "HR" },
    { name: "Finance", code: "FIN" },
    { name: "Sales", code: "SAL" },
    { name: "Design", code: "DES" },
  ]);
  const D = Object.fromEntries(depts.map((d) => [d.code, d.id]));
  const titles = [
    ["Chief Executive Officer", 10], ["Director - Engineering", 8], ["Engineering Manager", 6], ["Senior AI Engineer", 5], ["AI Engineer", 4],
    ["Software Engineer", 3], ["Software Engineer Intern", 1], ["Head - People Success", 8], ["HR Executive", 3], ["Finance Manager", 6],
    ["Accountant", 3], ["Sales Manager", 6], ["Sales Executive", 3], ["Product Designer", 4], ["System Administrator", 7],
  ] as const;
  const desigs = await ins<{ id: string; title: string }>("designations", titles.map(([title, level]) => ({ title, level })));
  const T = Object.fromEntries(desigs.map((d) => [d.title, d.id]));
  const locs = await ins<{ id: string; name: string }>("locations", [
    { name: "Bangalore", city: "Bengaluru" },
    { name: "Chennai", city: "Chennai" },
    { name: "Coimbatore", city: "Coimbatore" },
    { name: "Remote", city: null },
  ]);
  const L = Object.fromEntries(locs.map((l) => [l.name, l.id]));

  type Spec = {
    key: string; first: string; last: string; email: string; title: string; dept: string; loc: string; mgr?: string;
    role?: "employee" | "manager" | "hr_admin" | "super_admin"; doj: string; dob: string; gender: "male" | "female"; type?: string; ctc: number; blood?: string;
  };
  const specs: Spec[] = [
    { key: "arjun", first: "Arjun", last: "Mehta", email: "arjun@grevya.com", title: "Chief Executive Officer", dept: "LDR", loc: "Bangalore", role: "manager", doj: "2019-04-01", dob: "1980-02-11", gender: "male", ctc: 9000000, blood: "O+" },
    { key: "ananya", first: "Ananya", last: "Iyer", email: "hr@grevya.com", title: "Head - People Success", dept: "HR", loc: "Bangalore", mgr: "arjun", role: "hr_admin", doj: "2020-06-15", dob: "1986-10-29", gender: "female", ctc: 3600000, blood: "B+" },
    { key: "vikram", first: "Vikram", last: "Rao", email: "vikram@grevya.com", title: "Director - Engineering", dept: "ENG", loc: "Bangalore", mgr: "arjun", role: "manager", doj: "2020-01-06", dob: "1982-07-19", gender: "male", ctc: 5200000, blood: "A+" },
    { key: "kavin", first: "Kavin", last: "N R", email: "kavin@grevya.com", title: "Senior AI Engineer", dept: "GAI", loc: "Bangalore", mgr: "vikram", role: "manager", doj: "2025-10-27", dob: "2000-11-14", gender: "male", ctc: 2400000, blood: "O+" },
    { key: "priya", first: "Priya", last: "Nair", email: "priya@grevya.com", title: "AI Engineer", dept: "GAI", loc: "Bangalore", mgr: "kavin", doj: "2024-02-12", dob: "1998-10-31", gender: "female", ctc: 1400000, blood: "AB+" },
    { key: "rahul", first: "Rahul", last: "Verma", email: "rahul@grevya.com", title: "Software Engineer", dept: "GAI", loc: "Bangalore", mgr: "kavin", doj: "2023-10-09", dob: "1997-03-22", gender: "male", ctc: 1200000 },
    { key: "sneha", first: "Sneha", last: "Kulkarni", email: "sneha@grevya.com", title: "AI Engineer", dept: "GAI", loc: "Chennai", mgr: "kavin", doj: "2024-07-01", dob: "1999-12-05", gender: "female", ctc: 1350000 },
    { key: "arvind", first: "Arvind", last: "Krishnan", email: "arvind@grevya.com", title: "Engineering Manager", dept: "ENG", loc: "Bangalore", mgr: "vikram", role: "manager", doj: "2021-03-01", dob: "1988-05-17", gender: "male", ctc: 3200000 },
    { key: "lakshmi", first: "Lakshmi", last: "Prasad", email: "lakshmi@grevya.com", title: "Software Engineer", dept: "ENG", loc: "Bangalore", mgr: "arvind", doj: "2022-08-16", dob: "1996-10-08", gender: "female", ctc: 1500000 },
    { key: "manoj", first: "Manoj", last: "Pillai", email: "manoj@grevya.com", title: "Software Engineer", dept: "ENG", loc: "Coimbatore", mgr: "arvind", doj: "2023-01-09", dob: "1995-01-28", gender: "male", ctc: 1300000 },
    { key: "fatima", first: "Fatima", last: "Sheikh", email: "fatima@grevya.com", title: "Software Engineer Intern", dept: "ENG", loc: "Remote", mgr: "arvind", doj: "2026-07-01", dob: "2003-06-02", gender: "female", type: "intern", ctc: 480000 },
    { key: "neha", first: "Neha", last: "Sharma", email: "neha@grevya.com", title: "Product Designer", dept: "DES", loc: "Bangalore", mgr: "vikram", doj: "2022-10-24", dob: "1994-09-13", gender: "female", ctc: 1800000 },
    { key: "divya", first: "Divya", last: "Menon", email: "divya@grevya.com", title: "HR Executive", dept: "HR", loc: "Bangalore", mgr: "ananya", role: "hr_admin", doj: "2023-05-02", dob: "1996-04-21", gender: "female", ctc: 900000 },
    { key: "deepak", first: "Deepak", last: "Shah", email: "deepak@grevya.com", title: "Finance Manager", dept: "FIN", loc: "Bangalore", mgr: "arjun", role: "manager", doj: "2021-09-13", dob: "1985-12-24", gender: "male", ctc: 3000000 },
    { key: "meera", first: "Meera", last: "Joshi", email: "meera@grevya.com", title: "Accountant", dept: "FIN", loc: "Bangalore", mgr: "deepak", doj: "2024-11-04", dob: "1997-08-30", gender: "female", ctc: 800000 },
    { key: "karthik", first: "Karthik", last: "Subramanian", email: "karthik@grevya.com", title: "Sales Manager", dept: "SAL", loc: "Chennai", mgr: "arjun", role: "manager", doj: "2021-06-21", dob: "1987-02-26", gender: "male", ctc: 2800000 },
    { key: "aisha", first: "Aisha", last: "Khan", email: "aisha@grevya.com", title: "Sales Executive", dept: "SAL", loc: "Chennai", mgr: "karthik", doj: "2024-03-18", dob: "1998-07-07", gender: "female", ctc: 900000 },
    { key: "admin", first: "Grevya", last: "Admin", email: "admin@grevya.com", title: "System Administrator", dept: "HR", loc: "Bangalore", mgr: "arjun", role: "super_admin", doj: "2019-04-01", dob: "1990-01-01", gender: "male", ctc: 2000000 },
    { key: "rohan", first: "Rohan", last: "Gupta", email: "rohan@grevya.com", title: "Sales Executive", dept: "SAL", loc: "Chennai", mgr: "karthik", doj: "2023-08-07", dob: "1996-11-19", gender: "male", ctc: 950000 },
  ];

  const E: Record<string, Emp> = {};
  let code = 1001;
  for (const s of specs) {
    const [e] = await ins<Emp>("employees", {
      employee_code: `GRV${code++}`,
      first_name: s.first,
      last_name: s.last,
      email: s.email,
      phone: `+91 9${between(100000000, 999999999)}`,
      gender: s.gender,
      date_of_birth: s.dob,
      date_of_joining: s.doj,
      department_id: D[s.dept],
      designation_id: T[s.title],
      location_id: L[s.loc],
      manager_id: s.mgr ? E[s.mgr].id : null,
      role: s.role ?? "employee",
      employment_type: s.type ?? "full_time",
      blood_group: s.blood ?? pick(["A+", "B+", "O+", "AB+", "O-"]),
      marital_status: pick(["Single", "Married"]),
      bio: s.key === "kavin" ? "Building GenAI products and agentic workflows. Loves turning messy processes into simple tools." : null,
    }, "id, email, first_name, full_name, manager_id, date_of_joining, role");
    E[s.key] = e;
  }
  console.log(`Employees: ${specs.length}`);

  for (const s of specs) await createLogin(s.email, PASSWORD);
  console.log("Logins created (password Grevya@123)");

  await ins("employee_private", specs.map((s) => ({
    employee_id: E[s.key].id,
    personal_email: `${s.first.toLowerCase()}.${s.last.toLowerCase().replace(/\s/g, "")}@example.com`,
    address: s.key === "kavin" ? null : `${between(1, 220)}, ${pick(["MG Road", "Indiranagar 100 Ft Rd", "HSR Layout Sector 2", "Anna Nagar", "RS Puram"])}, ${s.loc === "Remote" ? "Pune" : s.loc}`,
    emergency_contact_name: s.key === "kavin" ? null : pick(["Parent", "Spouse", "Sibling"]),
    emergency_contact_phone: s.key === "kavin" ? null : `+91 9${between(100000000, 999999999)}`,
    pan_number: `${pick(["ABCPN", "BQXPK", "CZRPM", "DKLPS"])}${between(1000, 9999)}${pick(["A", "F", "K", "Q"])}`,
    bank_name: pick(["HDFC Bank", "ICICI Bank", "State Bank of India", "Axis Bank"]),
    bank_account: String(between(10000000, 99999999)) + String(between(1000, 9999)),
    ifsc: pick(["HDFC0001234", "ICIC0004321", "SBIN0007788", "UTIB0002211"]),
    uan: String(between(100000000000, 999999999999)),
  })));

  await ins("employee_education", [
    { employee_id: E.kavin.id, degree: "MBA", institution: "Sri Krishna College of Technology", start_date: "2021-11-01", end_date: "2023-05-31" },
    { employee_id: E.kavin.id, degree: "B.Com", institution: "Sri Krishna Arts & Science College, Coimbatore", start_date: "2018-06-01", end_date: "2021-05-31" },
    { employee_id: E.priya.id, degree: "B.Tech Computer Science", institution: "College of Engineering, Trivandrum", start_date: "2016-08-01", end_date: "2020-05-31" },
    { employee_id: E.vikram.id, degree: "M.Tech", institution: "IIT Madras", start_date: "2003-07-01", end_date: "2005-05-31" },
    { employee_id: E.ananya.id, degree: "MBA - Human Resources", institution: "XLRI Jamshedpur", start_date: "2008-06-01", end_date: "2010-04-30" },
  ]);
  await ins("employee_experience", [
    { employee_id: E.kavin.id, company: "Keemakr AI", designation: "Founders Office - Strategy Operations", start_date: "2026-04-01", end_date: "2026-10-01" },
    { employee_id: E.kavin.id, company: "Softworks Technologies", designation: "AI Solution Architect", start_date: "2025-10-01", end_date: "2026-03-31" },
    { employee_id: E.kavin.id, company: "Mazo Solutions", designation: "Gen AI Developer", start_date: "2023-11-01", end_date: "2025-09-30" },
    { employee_id: E.priya.id, company: "Infosys", designation: "Systems Engineer", start_date: "2020-07-01", end_date: "2024-01-31" },
  ]);

  // Leave balances
  const { data: lts } = await db.from("leave_types").select("id, code, annual_quota");
  const LT = Object.fromEntries((lts ?? []).map((l) => [l.code, l]));
  const balances: Row[] = [];
  for (const s of specs) {
    for (const l of lts ?? []) {
      if (["CL", "SL", "EL", "COMP", "LOP"].includes(l.code)) {
        balances.push({ employee_id: E[s.key].id, leave_type_id: l.id, year, allocated: l.code === "EL" ? Number(l.annual_quota) + between(0, 5) : l.annual_quota });
      }
    }
  }
  await ins("leave_balances", balances);

  // Leaves: approved past + pending
  const { data: hol } = await db.from("holidays").select("date").eq("type", "public");
  const holidaySet = new Set((hol ?? []).map((h) => h.date));
  const countWorking = (a: string, b: string) => {
    let n = 0;
    for (let d = a; d <= b; d = addDays(d, 1)) if (!isWeekend(d) && !holidaySet.has(d)) n++;
    return n;
  };
  const leaveRows: { emp: string; type: string; start: string; end: string; days: number; reason: string; status: "approved" | "pending" | "rejected" }[] = [
    { emp: "kavin", type: "CL", start: "2026-10-09", end: "2026-10-09", days: 1, reason: "Family function", status: "approved" },
    { emp: "priya", type: "SL", start: "2026-09-22", end: "2026-09-23", days: 2, reason: "Fever", status: "approved" },
    { emp: "priya", type: "EL", start: addDays(today, 10), end: addDays(today, 12), days: 3, reason: "Trip home to Kochi", status: "pending" },
    { emp: "rahul", type: "CL", start: addDays(today, 3), end: addDays(today, 3), days: 1, reason: "Personal work", status: "pending" },
    { emp: "sneha", type: "EL", start: "2026-10-12", end: "2026-10-16", days: 5, reason: "Vacation", status: "approved" },
    { emp: "lakshmi", type: "SL", start: "2026-10-05", end: "2026-10-05", days: 1, reason: "Doctor appointment", status: "approved" },
    { emp: "aisha", type: "CL", start: "2026-09-30", end: "2026-09-30", days: 1, reason: "Bank work", status: "rejected" },
    { emp: "manoj", type: "EL", start: addDays(today, 20), end: addDays(today, 24), days: 5, reason: "Sister's wedding", status: "pending" },
  ];
  for (const l of leaveRows) {
    const [row] = await ins<{ id: string }>("leave_requests", {
      employee_id: E[l.emp].id, leave_type_id: LT[l.type].id, start_date: l.start, end_date: l.end, days: countWorking(l.start, l.end) || l.days, reason: l.reason,
    }, "id");
    if (l.status !== "pending") {
      await upd("leave_requests", { status: l.status, approver_id: E[l.emp].manager_id, actioned_at: new Date().toISOString(), approver_remarks: l.status === "rejected" ? "Quarter-end client visits" : "Approved" }, { id: row.id });
    }
  }
  const leaveDays = new Set<string>();
  for (const l of leaveRows.filter((x) => x.status === "approved")) {
    for (let d = l.start; d <= l.end; d = addDays(d, 1)) leaveDays.add(`${E[l.emp].id}|${d}`);
  }

  // Attendance since 1 Sep (not today)
  const att: Row[] = [];
  for (const s of specs) {
    const e = E[s.key];
    for (let d = "2026-09-01"; d < today; d = addDays(d, 1)) {
      if (d < e.date_of_joining || isWeekend(d) || holidaySet.has(d) || leaveDays.has(`${e.id}|${d}`)) continue;
      const r = rand();
      if (r < 0.035) continue; // absent / missed punch
      const wfh = r > 0.88;
      const inH = 9, inM = between(5, 59) + (rand() < 0.12 ? 20 : 0);
      const ci = ts(d, inH + Math.floor(inM / 60), inM % 60);
      const outH = between(18, 19), outM = between(0, 55);
      att.push({ employee_id: e.id, date: d, check_in: ci, check_out: ts(d, outH, outM), status: wfh ? "wfh" : "present", work_mode: wfh ? "remote" : "office", source: "web" });
    }
  }
  for (let i = 0; i < att.length; i += 500) await ins("attendance_records", att.slice(i, i + 500), "id");
  console.log(`Attendance records: ${att.length}`);

  // Remote check-ins (selfie + location) for a few people over the last working days
  {
    const { readFileSync } = await import("node:fs");
    const photo = "seed/remote-sample.jpg";
    await db.storage.from("attendance-photos").upload(photo, readFileSync("scripts/assets/remote-sample.jpg"), { contentType: "image/jpeg", upsert: true });
    const people: [string, number, number][] = [["fatima", 18.5204, 73.8567], ["sneha", 13.0827, 80.2707], ["aisha", 13.0475, 80.2090]];
    const remote: Row[] = [];
    for (const [key, lat, lng] of people) {
      let added = 0;
      for (let d = addDays(today, -1); added < 6 && d > addDays(today, -20); d = addDays(d, -1)) {
        if (isWeekend(d) || holidaySet.has(d) || d < E[key].date_of_joining || leaveDays.has(`${E[key].id}|${d}`)) continue;
        const inM = between(0, 40), outH = between(17, 19), outM = between(0, 55);
        remote.push({
          employee_id: E[key].id, work_date: d,
          check_in_at: ts(d, 9, inM), check_out_at: ts(d, outH, outM),
          check_in_photo: photo, check_out_photo: photo,
          check_in_lat: lat + rand() * 0.002, check_in_lng: lng + rand() * 0.002, check_in_accuracy: between(8, 40),
          check_out_lat: lat + rand() * 0.002, check_out_lng: lng + rand() * 0.002, check_out_accuracy: between(8, 40),
          check_in_device: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
          check_out_device: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
          check_in_ip: `49.37.${between(1, 254)}.${between(1, 254)}`, notes: pick(["Sprint tasks", "Client calls and documentation", "Code reviews", "Lead follow-ups"]),
        });
        added++;
      }
    }
    await ins("remote_work_sessions", remote, "id");
    for (const r of remote) {
      await db.from("attendance_records").upsert(
        { employee_id: r.employee_id, date: r.work_date, check_in: r.check_in_at, check_out: r.check_out_at, status: "wfh", work_mode: "remote", source: "web", notes: "Remote check-in with photo" },
        { onConflict: "employee_id,date" },
      );
    }
    console.log(`Remote sessions: ${remote.length}`);
  }

  // Regularization + comp-off
  const missed = (() => {
    for (let d = addDays(today, -1); d > addDays(today, -20); d = addDays(d, -1)) {
      if (!isWeekend(d) && !holidaySet.has(d) && !att.some((a) => a.employee_id === E.rahul.id && a.date === d)) return d;
    }
    return addDays(today, -6);
  })();
  await ins("regularization_requests", [
    { employee_id: E.rahul.id, date: missed, request_type: "missed_punch", check_in: ts(missed, 9, 40), check_out: ts(missed, 18, 45), reason: "Forgot to punch — was at the client site" },
  ]);
  await ins("compoff_requests", [
    { employee_id: E.sneha.id, worked_date: "2026-10-03", days: 1, reason: "Production release support on Saturday" },
  ]);

  // Salary structures + payslips
  const ctcOf = Object.fromEntries(specs.map((s) => [s.key, s.ctc]));
  for (const s of specs) {
    const ctc = ctcOf[s.key];
    const basic = Math.round(ctc * 0.4);
    const hra = Math.round(basic * 0.5);
    const pf = Math.round(basic * 0.12);
    const gratuity = Math.round(basic * 0.0481);
    const fbp = ctc >= 1000000 ? 120000 : 0;
    await ins("salary_structures", {
      employee_id: E[s.key].id, effective_from: s.doj > "2026-04-01" ? s.doj : "2026-04-01", annual_ctc: ctc, basic, hra,
      fbp_total: fbp, pf_employer: pf, gratuity, special_allowance: ctc - basic - hra - pf - gratuity - fbp, variable_pay: 0,
    });
  }
  const months: [number, number][] = [];
  {
    const [cy, cm] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
    for (let i = 5; i >= 1; i--) {
      let m = cm - i, y = cy;
      while (m <= 0) { m += 12; y--; }
      months.push([y, m]);
    }
  }
  const slips: Row[] = [];
  for (const s of specs) {
    const ctc = ctcOf[s.key];
    const basic = Math.round(ctc * 0.4), hra = Math.round(basic * 0.5), pf = Math.round(basic * 0.12), grat = Math.round(basic * 0.0481);
    const fbp = ctc >= 1000000 ? 120000 : 0;
    const special = ctc - basic - hra - pf - grat - fbp;
    const tax = newRegimeTax(ctc - pf - grat - 75000);
    for (const [y, m] of months) {
      const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
      if (monthStart < s.doj.slice(0, 8) + "01") continue;
      const earnings = [
        { label: "Basic", amount: r2(basic / 12) },
        { label: "House Rent Allowance", amount: r2(hra / 12) },
        { label: "Special Allowance", amount: r2(special / 12) },
        ...(fbp ? [{ label: "Flexible Benefits", amount: r2(fbp / 12) }] : []),
      ];
      const deductions = [
        { label: "Employee PF", amount: r2((basic / 12) * 0.12) },
        { label: "Professional Tax", amount: 200 },
        { label: "Income Tax (TDS)", amount: r2(tax / 12) },
      ];
      const gross = r2(earnings.reduce((a, b) => a + b.amount, 0));
      const ded = r2(deductions.reduce((a, b) => a + b.amount, 0));
      const wd = workingDays(y, m, holidaySet);
      slips.push({
        employee_id: E[s.key].id, year: y, month: m, earnings, deductions, gross, total_deductions: ded, net_pay: r2(gross - ded),
        working_days: wd, paid_days: wd, lop_days: 0, status: "published", published_at: `${y}-${String(m).padStart(2, "0")}-28T10:00:00${IST}`,
      });
    }
  }
  for (let i = 0; i < slips.length; i += 200) await ins("payslips", slips.slice(i, i + 200), "id");
  console.log(`Payslips: ${slips.length}`);
  await ins("vpf_declarations", { employee_id: E.priya.id, financial_year: "2026-27", percentage: 5, effective_month: "2026-11-01" });
  await ins("investment_declarations", {
    employee_id: E.kavin.id, financial_year: "2026-27", regime: "new", status: "draft",
    items: [{ section: "80C", label: "PPF", declared: 60000, proof_amount: 0 }, { section: "80D", label: "Health insurance (self & family)", declared: 18000, proof_amount: 0 }],
  });

  // Claims
  const { data: cats } = await db.from("claim_categories").select("id, name");
  const C = Object.fromEntries((cats ?? []).map((c) => [c.name, c.id]));
  const claimSpecs = [
    { emp: "priya", cat: "Travel", title: "Cab to client office – Whitefield", date: addDays(today, -4), amount: 1240, status: "submitted" },
    { emp: "priya", cat: "Learning & Certification", title: "AWS ML Specialty exam fee", date: addDays(today, -12), amount: 24500, status: "submitted" },
    { emp: "kavin", cat: "Internet & Mobile", title: "Broadband – September", date: "2026-09-30", amount: 1179, status: "paid" },
    { emp: "kavin", cat: "Food & Meals", title: "Team dinner after release", date: "2026-10-16", amount: 4200, status: "approved" },
    { emp: "aisha", cat: "Client Entertainment", title: "Lunch with prospect", date: addDays(today, -2), amount: 3650, status: "submitted" },
    { emp: "rahul", cat: "Office Supplies", title: "Ergonomic keyboard", date: addDays(today, -20), amount: 3299, status: "rejected" },
  ];
  for (const c of claimSpecs) {
    const [row] = await ins<{ id: string }>("claims", { employee_id: E[c.emp].id, category_id: C[c.cat], title: c.title, expense_date: c.date, amount: c.amount, description: c.title }, "id");
    if (c.status !== "submitted") {
      await upd("claims", { status: c.status === "paid" ? "approved" : c.status, approver_id: E[c.emp].manager_id, actioned_at: new Date().toISOString(), approver_remarks: c.status === "rejected" ? "Please raise via IT asset request" : "OK" }, { id: row.id });
      if (c.status === "paid") await upd("claims", { status: "paid", paid_at: new Date().toISOString() }, { id: row.id });
    }
  }

  // Performance
  const [h1] = await ins<{ id: string }>("review_cycles", { name: "H1 2026 Review", start_date: "2026-01-01", end_date: "2026-06-30", status: "closed" });
  const [fy] = await ins<{ id: string }>("review_cycles", { name: "FY 2026-27 Annual", start_date: "2026-04-01", end_date: "2027-03-31", status: "goal_setting" });
  const objectives = await ins<{ id: string; title: string }>("goals", [
    { title: "Grow ARR to ₹50 Cr", description: "Expand enterprise accounts and launch two new GenAI products.", category: "organisation", status: "approved", progress: 42, cycle_id: fy.id, created_by: E.arjun.id },
    { title: "Ship a best-in-class GenAI platform", description: "Reliable, observable, secure agent platform used by every product team.", category: "organisation", status: "approved", progress: 55, cycle_id: fy.id, created_by: E.arjun.id },
    { title: "Be a great place to grow", description: "eNPS above 50 and 40 learning hours per person.", category: "organisation", status: "approved", progress: 60, cycle_id: fy.id, created_by: E.ananya.id },
  ]);
  const [vikGoal] = await ins<{ id: string }>("goals", { employee_id: E.vikram.id, cycle_id: fy.id, parent_goal_id: objectives[1].id, title: "Launch agent platform v2 by Q3", category: "business", weightage: 50, target: "GA release with 99.9% uptime", progress: 60, status: "approved", due_date: "2027-01-31" });
  const kavinGoals = await ins<{ id: string }>("goals", [
    { employee_id: E.kavin.id, cycle_id: fy.id, parent_goal_id: vikGoal.id, title: "Build RAG evaluation harness", description: "Automated offline evals for retrieval quality across 5 product verticals.", category: "business", weightage: 40, target: "Eval coverage ≥ 90% of prompts", progress: 65, status: "approved", due_date: "2026-12-31" },
    { employee_id: E.kavin.id, cycle_id: fy.id, parent_goal_id: vikGoal.id, title: "Cut LLM inference cost by 30%", category: "business", weightage: 30, target: "Cost per 1k requests down 30% vs Apr baseline", progress: 35, status: "approved", due_date: "2027-02-28" },
    { employee_id: E.kavin.id, cycle_id: fy.id, parent_goal_id: objectives[2].id, title: "Mentor two engineers to independent delivery", category: "development", weightage: 20, progress: 50, status: "approved", due_date: "2027-03-31" },
    { employee_id: E.kavin.id, cycle_id: fy.id, title: "Complete Advanced LLM Ops certification", category: "development", weightage: 10, progress: 0, status: "draft", due_date: "2027-01-31" },
  ]);
  for (const g of kavinGoals.slice(0, 2)) {
    await ins("goal_updates", { goal_id: g.id, author_id: E.kavin.id, progress: 30, comment: "Baseline established and first milestone done." });
  }
  await ins("goals", [
    { employee_id: E.priya.id, cycle_id: fy.id, parent_goal_id: kavinGoals[0].id, title: "Own retrieval metrics dashboard", category: "business", weightage: 50, target: "Daily refreshed dashboard", status: "pending_approval", due_date: "2026-12-15" },
    { employee_id: E.priya.id, cycle_id: fy.id, title: "Present at internal tech talk", category: "development", weightage: 20, status: "pending_approval", due_date: "2027-02-15" },
    { employee_id: E.rahul.id, cycle_id: fy.id, parent_goal_id: kavinGoals[1].id, title: "Implement response caching layer", category: "business", weightage: 60, progress: 40, status: "approved", due_date: "2026-12-31" },
    { employee_id: E.sneha.id, cycle_id: fy.id, parent_goal_id: kavinGoals[0].id, title: "Build multilingual eval set", category: "business", weightage: 50, progress: 70, status: "approved", due_date: "2026-11-30" },
  ]);
  const reviewRows: Row[] = [];
  for (const s of specs) {
    if (!E[s.key].manager_id || s.doj > "2026-06-30") continue;
    const self = pick([3.5, 4, 4, 4.5]);
    reviewRows.push({ cycle_id: h1.id, employee_id: E[s.key].id, reviewer_id: E[s.key].manager_id, self_rating: self, self_comments: "Delivered my key commitments for the half.", manager_rating: Math.min(5, self - 0.5 + pick([0, 0.5, 1])), manager_comments: "Solid half with strong ownership.", final_rating: self, status: "completed", self_submitted_at: "2026-07-05T10:00:00Z", completed_at: "2026-07-20T10:00:00Z" });
  }
  await ins("reviews", reviewRows);

  // Exit
  const [res] = await ins<{ id: string }>("resignations", { employee_id: E.rohan.id, reason_category: "Higher studies", reason: "I have been admitted to a full-time MBA programme starting in January.", resignation_date: addDays(today, -3), requested_last_day: addDays(today, 57), notice_period_days: 60 });
  void res;

  // Learning
  const courses = await ins<{ id: string; title: string }>("courses", [
    { title: "Prompt Engineering Fundamentals", category: "Technical", level: "beginner", duration_hours: 4, provider: "Internal", is_mandatory: false, description: "Write prompts that are clear, testable and robust.", modules: [{ title: "Anatomy of a prompt", duration_minutes: 40 }, { title: "Few-shot & structure", duration_minutes: 60 }, { title: "Evaluating prompts", duration_minutes: 70 }, { title: "Capstone", duration_minutes: 70 }] },
    { title: "Retrieval-Augmented Generation in Production", category: "Technical", level: "advanced", duration_hours: 8, provider: "Internal", description: "Chunking, embeddings, hybrid search, evaluation and monitoring.", modules: [{ title: "Indexing strategies", duration_minutes: 90 }, { title: "Hybrid retrieval", duration_minutes: 90 }, { title: "Evals", duration_minutes: 120 }, { title: "Observability", duration_minutes: 90 }, { title: "Cost & latency", duration_minutes: 90 }] },
    { title: "Information Security Awareness 2026", category: "Compliance", level: "beginner", duration_hours: 1, is_mandatory: true, description: "Mandatory annual security training for all employees.", modules: [{ title: "Phishing", duration_minutes: 20 }, { title: "Data handling", duration_minutes: 20 }, { title: "Incident reporting", duration_minutes: 20 }] },
    { title: "Prevention of Sexual Harassment (POSH)", category: "Compliance", level: "beginner", duration_hours: 1, is_mandatory: true, description: "Understand your rights, responsibilities and the redressal process.", modules: [{ title: "What is harassment", duration_minutes: 25 }, { title: "The ICC process", duration_minutes: 35 }] },
    { title: "Leading High-Performing Teams", category: "Leadership", level: "intermediate", duration_hours: 6, provider: "Grevya Academy", description: "Feedback, delegation, 1:1s and running effective reviews.", modules: [{ title: "Setting goals", duration_minutes: 60 }, { title: "Feedback that lands", duration_minutes: 90 }, { title: "Delegation", duration_minutes: 90 }, { title: "Reviews", duration_minutes: 120 }] },
    { title: "Consultative Selling", category: "Sales", level: "intermediate", duration_hours: 5, provider: "Grevya Academy", description: "Discovery, value mapping and closing enterprise deals.", modules: [{ title: "Discovery", duration_minutes: 75 }, { title: "Value mapping", duration_minutes: 75 }, { title: "Negotiation", duration_minutes: 75 }, { title: "Closing", duration_minutes: 75 }] },
    { title: "Design Systems with Figma", category: "Design", level: "intermediate", duration_hours: 6, provider: "External", content_url: "https://help.figma.com", description: "Tokens, components and documentation that scale.", modules: [{ title: "Tokens", duration_minutes: 90 }, { title: "Components", duration_minutes: 120 }, { title: "Docs", duration_minutes: 150 }] },
    { title: "Effective Business Communication", category: "Soft Skills", level: "beginner", duration_hours: 3, description: "Write and present with clarity.", modules: [{ title: "Writing", duration_minutes: 60 }, { title: "Presenting", duration_minutes: 60 }, { title: "Meetings", duration_minutes: 60 }] },
  ]);
  const CO = Object.fromEntries(courses.map((c) => [c.title, c.id]));
  const enroll: Row[] = [];
  for (const s of specs) {
    const done = rand() > 0.35;
    enroll.push({ course_id: CO["Information Security Awareness 2026"], employee_id: E[s.key].id, assigned_by: E.ananya.id, status: done ? "completed" : "enrolled", progress: done ? 100 : 0, due_date: "2026-11-30", completed_at: done ? "2026-10-10T10:00:00Z" : null });
  }
  enroll.push(
    { course_id: CO["Retrieval-Augmented Generation in Production"], employee_id: E.kavin.id, status: "in_progress", progress: 60 },
    { course_id: CO["Leading High-Performing Teams"], employee_id: E.kavin.id, assigned_by: E.vikram.id, status: "in_progress", progress: 25, due_date: "2026-12-31" },
    { course_id: CO["Prompt Engineering Fundamentals"], employee_id: E.kavin.id, status: "completed", progress: 100, completed_at: "2026-09-18T10:00:00Z" },
    { course_id: CO["Prompt Engineering Fundamentals"], employee_id: E.priya.id, assigned_by: E.kavin.id, status: "in_progress", progress: 50, due_date: "2026-11-15" },
    { course_id: CO["Retrieval-Augmented Generation in Production"], employee_id: E.sneha.id, assigned_by: E.kavin.id, status: "enrolled", progress: 0, due_date: "2026-12-15" },
    { course_id: CO["Consultative Selling"], employee_id: E.aisha.id, assigned_by: E.karthik.id, status: "in_progress", progress: 75, due_date: "2026-11-10" },
  );
  await ins("course_enrollments", enroll);

  // Learning: paths, knowledge wiki, training calendar, external training
  // (--reset doesn't list these tables; clear rows that outlive their employees)
  for (const t of ["learning_paths", "training_sessions"]) {
    const { error } = await db.from(t).delete().not("id", "is", null);
    if (error) throw new Error(`reset ${t}: ${error.message}`);
  }
  const [lp1, lp2] = await ins<{ id: string }>("learning_paths", [
    { title: "GenAI Engineer Foundations", description: "From your first prompt to production retrieval systems — the core path for everyone building with LLMs at Grevya.", category: "Technical", published: true, created_by: E.ananya.id },
    { title: "New Manager Essentials", description: "Communication, feedback and compliance basics for people stepping into their first lead role.", category: "Leadership", published: true, created_by: E.ananya.id },
  ]);
  await ins("learning_path_courses", [
    { path_id: lp1.id, course_id: CO["Prompt Engineering Fundamentals"], position: 0 },
    { path_id: lp1.id, course_id: CO["Retrieval-Augmented Generation in Production"], position: 1 },
    { path_id: lp1.id, course_id: CO["Information Security Awareness 2026"], position: 2 },
    { path_id: lp2.id, course_id: CO["Effective Business Communication"], position: 0 },
    { path_id: lp2.id, course_id: CO["Leading High-Performing Teams"], position: 1 },
    { path_id: lp2.id, course_id: CO["Prevention of Sexual Harassment (POSH)"], position: 2 },
  ]);
  await ins("learning_path_enrollments", { path_id: lp1.id, employee_id: E.kavin.id, started_at: ts(addDays(today, -20), 10, 0) });

  const daysAgo = (n: number) => ts(addDays(today, -n), 11, 0);
  const wiki = [
    { author_id: E.kavin.id, title: "How we evaluate RAG pipelines", category: "Gen AI", tags: ["rag", "evals", "llm"], status: "published", view_count: 42, published: 9,
      content: "# Why evals come first\nEvery retrieval change we ship is measured against a fixed golden set before it reaches a customer. Without evals, \"it looks better\" is just a feeling.\n\n## The golden set\n- 150 real customer questions, anonymised\n- An expected answer and the source passages for each\n- Refreshed every quarter with new failure cases\n\n## What we measure\n1. **Retrieval recall@5** — did the right passage show up?\n2. **Answer faithfulness** — is every claim backed by a retrieved passage?\n3. **Latency p95** — must stay under 2.5 seconds\n\n> Tip: run `make eval` locally before opening a PR. CI runs the same suite and posts the diff.\n\n## When a metric drops\nRoll back first, investigate second. Post the eval diff in #genai-quality so others learn from it." },
    { author_id: E.ananya.id, title: "Your first week at Grevya: a checklist", category: "Onboarding", tags: ["onboarding", "checklist"], status: "published", view_count: 118, published: 20,
      content: "# Welcome aboard!\nThis checklist helps you settle in during your first five days.\n\n## Day 1\n- Collect your laptop and ID card from the IT desk\n- Sign in to People Success and complete your profile\n- Acknowledge the Code of Conduct and Information Security policies\n\n## Days 2–3\n- Meet your manager for a 30-minute onboarding 1:1\n- Start the mandatory **Information Security Awareness** course\n- Join the #general and #ask-hr Slack channels\n\n## Days 4–5\n- Set your first goals with your manager\n- Book a coffee with your buddy\n\n> Questions? Raise a ticket under More Apps → HR Helpdesk and we will get back within a working day." },
    { author_id: E.arvind.id, title: "Code review guidelines for the platform team", category: "Engineering", tags: ["code-review", "engineering"], status: "published", view_count: 67, published: 14,
      content: "# Reviews are for learning\nA good review makes the code better **and** makes the author better. Be kind, be specific, be quick.\n\n## For authors\n- Keep PRs under 400 lines where possible\n- Explain the *why* in the description, not just the what\n- Self-review before requesting reviewers\n\n## For reviewers\n1. Respond within one working day\n2. Prefix nits with `nit:` so authors can skip them\n3. Approve when it is better than before — not when it is perfect\n\n## Blocking issues\nSecurity, data loss, missing tests for business logic, and breaking API changes always block a merge." },
    { author_id: E.neha.id, title: "Writing accessible UI copy", category: "Design", tags: ["design", "accessibility", "ux-writing"], status: "published", view_count: 23, published: 4,
      content: "# Words are interface\nMost accessibility issues we find in audits are copy problems, not colour problems.\n\n## Buttons and links\n- Start with a verb: \"Download payslip\", not \"Payslip\"\n- Never use \"Click here\" — screen readers list links out of context\n\n## Errors\n- Say what happened and how to fix it\n- Do not blame the user: \"We could not find that date\" beats \"Invalid input\"\n\n## Quick checks\n1. Read the screen out loud — does it still make sense?\n2. Is every icon button labelled?\n3. Would this make sense to someone new to the product?" },
    { author_id: E.rahul.id, title: "Getting access to the shared GPU cluster", category: "Tools", tags: ["gpu", "infra"], status: "submitted", view_count: 0, published: 0,
      content: "# Requesting access\nRaise an IT & Access ticket with your team name and expected monthly GPU hours.\n\n## Etiquette\n- Release idle notebooks after 2 hours\n- Use the `preemptible` queue for experiments\n- Tag jobs with your project code for cost tracking" },
    { author_id: E.sneha.id, title: "Notes on fine-tuning small models", category: "Gen AI", tags: ["fine-tuning"], status: "draft", view_count: 0, published: 0,
      content: "# Draft\nCollecting my notes from the LoRA experiments — not ready yet." },
  ];
  const wikiRows = await ins<{ id: string }>("wiki_articles", wiki.map((w) => ({ author_id: w.author_id, title: w.title, category: w.category, tags: w.tags, status: w.status, view_count: w.view_count, content: w.content })));
  // The workflow trigger stamps review dates with now(); backdate the demo ones.
  for (const [i, w] of wiki.entries()) {
    if (w.status === "published") await upd("wiki_articles", { published_at: daysAgo(w.published), reviewed_at: daysAgo(w.published), reviewed_by: E.ananya.id, submitted_at: w.author_id === E.ananya.id ? null : daysAgo(w.published + 1) }, { id: wikiRows[i].id });
    if (w.status === "submitted") await upd("wiki_articles", { submitted_at: daysAgo(1) }, { id: wikiRows[i].id });
  }

  const [ts1, ts2, ts3] = await ins<{ id: string }>("training_sessions", [
    { title: "Hands-on: Building RAG pipelines", description: "A live coding session walking through chunking, hybrid retrieval and evals on a real support dataset. Bring a laptop with Python 3.11.", trainer: "Kavin N R", starts_at: ts(addDays(today, 7), 15, 0), ends_at: ts(addDays(today, 7), 17, 0), mode: "virtual", meeting_link: "https://meet.google.com/grv-rag-live", capacity: 20, course_id: CO["Retrieval-Augmented Generation in Production"], created_by: E.ananya.id },
    { title: "POSH awareness session", description: "Annual in-person session with the Internal Committee. Attendance counts towards your POSH compliance.", trainer: "Ananya Iyer", starts_at: ts(addDays(today, 15), 11, 0), ends_at: ts(addDays(today, 15), 12, 0), mode: "in_person", location: "Bangalore office · Board room", capacity: 40, course_id: CO["Prevention of Sexual Harassment (POSH)"], created_by: E.ananya.id },
    { title: "Feedback that lands — workshop for leads", description: "Role-play the SBI feedback model and practise difficult conversations in small groups.", trainer: "Vikram Rao", starts_at: ts(addDays(today, 21), 16, 0), ends_at: ts(addDays(today, 21), 17, 30), mode: "virtual", meeting_link: "https://meet.google.com/grv-feedback", capacity: 12, course_id: CO["Leading High-Performing Teams"], created_by: E.ananya.id },
  ]);
  await ins("training_registrations", [
    { session_id: ts1.id, employee_id: E.kavin.id },
    { session_id: ts1.id, employee_id: E.rahul.id },
    { session_id: ts1.id, employee_id: E.sneha.id },
    { session_id: ts3.id, employee_id: E.kavin.id },
    { session_id: ts2.id, employee_id: E.neha.id },
  ]);

  await ins("external_trainings", [
    { employee_id: E.priya.id, title: "AWS Certified Machine Learning – Specialty", provider: "Amazon Web Services", training_type: "certification", mode: "online", start_date: addDays(today, 30), end_date: addDays(today, 30), cost: 24500, justification: "Our customer deployments are moving to SageMaker. The certification covers the MLOps patterns we need for the Q1 migration.", link: "https://aws.amazon.com/certification/certified-machine-learning-specialty/", status: "pending", created_at: daysAgo(2) },
    { employee_id: E.sneha.id, title: "PyData Global 2026", provider: "NumFOCUS", training_type: "conference", mode: "online", start_date: addDays(today, 36), end_date: addDays(today, 38), cost: 8000, justification: "Talks on evaluation tooling and LLM observability are directly relevant to our evals roadmap. I will share notes in the wiki.", link: "https://pydata.org/global2026", status: "approved", approver_id: E.kavin.id, approver_remarks: "Great pick — please do share your notes.", decided_at: daysAgo(5), created_at: daysAgo(8) },
  ]);

  // Recruit
  const jobs = await ins<{ id: string; title: string }>("job_openings", [
    { title: "Senior GenAI Engineer", department_id: D.GAI, location_id: L.Bangalore, experience_min: 4, experience_max: 8, openings: 2, referral_bonus: 75000, hiring_manager_id: E.kavin.id, created_by: E.ananya.id, description: "Design and ship LLM-powered products end to end.", requirements: "Python, LLM APIs, RAG, evals, cloud deployment." },
    { title: "Full Stack Engineer (Next.js)", department_id: D.ENG, location_id: L.Bangalore, experience_min: 2, experience_max: 5, openings: 3, referral_bonus: 50000, hiring_manager_id: E.arvind.id, created_by: E.ananya.id, description: "Build delightful product surfaces with React and Postgres.", requirements: "TypeScript, React, Node, SQL." },
    { title: "Enterprise Account Executive", department_id: D.SAL, location_id: L.Chennai, experience_min: 5, experience_max: 10, openings: 1, referral_bonus: 60000, hiring_manager_id: E.karthik.id, created_by: E.ananya.id, description: "Own a territory of enterprise accounts in South India.", requirements: "B2B SaaS sales, consultative selling." },
    { title: "Product Designer", department_id: D.DES, location_id: L.Remote, experience_min: 3, experience_max: 6, openings: 1, referral_bonus: 40000, hiring_manager_id: E.vikram.id, created_by: E.ananya.id, description: "Shape the experience of our AI products.", requirements: "Portfolio, Figma, design systems." },
    { title: "Payroll Specialist", department_id: D.FIN, location_id: L.Bangalore, experience_min: 2, experience_max: 5, openings: 1, referral_bonus: 25000, status: "on_hold", hiring_manager_id: E.deepak.id, created_by: E.ananya.id, description: "Run monthly payroll and statutory compliance.", requirements: "Indian payroll, PF/ESI/PT, TDS." },
  ]);
  const cands = await ins<{ id: string }>("candidates", [
    { job_id: jobs[0].id, full_name: "Siddharth Rao", email: "siddharth.rao@example.com", phone: "+91 98450 11223", current_company: "TCS", experience_years: 5, source: "referral", referred_by: E.priya.id, stage: "interview" },
    { job_id: jobs[0].id, full_name: "Ishita Bose", email: "ishita.bose@example.com", current_company: "Freshworks", experience_years: 6, source: "referral", referred_by: E.kavin.id, stage: "screening" },
    { job_id: jobs[1].id, full_name: "Varun Hegde", email: "varun.h@example.com", current_company: "Swiggy", experience_years: 3, source: "referral", referred_by: E.kavin.id, stage: "applied" },
    { job_id: jobs[1].id, full_name: "Ritika Saini", email: "ritika.saini@example.com", current_company: "Zoho", experience_years: 4, source: "portal", stage: "offer" },
    { job_id: jobs[2].id, full_name: "Gautam Iyer", email: "gautam.iyer@example.com", current_company: "Salesforce", experience_years: 8, source: "agency", stage: "interview" },
  ]);
  await ins("interviews", [
    { candidate_id: cands[0].id, interviewer_id: E.kavin.id, round_name: "Technical - LLM systems", scheduled_at: `${addDays(today, 2)}T11:00:00${IST}`, mode: "video" },
    { candidate_id: cands[4].id, interviewer_id: E.karthik.id, round_name: "Hiring manager", scheduled_at: `${addDays(today, 1)}T15:00:00${IST}`, mode: "in_person" },
  ]);

  // HRIS: policies, faqs, contracts, letters
  await ins("policies", [
    { title: "Leave Policy", category: "Time Off", version: "3.1", effective_date: "2026-01-01", summary: "Leave types, entitlements, approvals and carry-forward rules.", content: "<h2>Entitlements</h2><ul><li>Casual Leave: 8 days per year</li><li>Sick Leave: 8 days per year</li><li>Earned Leave: 15 days per year, carry forward up to 30 days</li></ul><h2>Applying</h2><p>Apply through People Success at least 3 working days in advance for planned leave. Sick leave beyond 2 days needs a medical certificate.</p><h2>Comp-off</h2><p>Work on a weekend or public holiday can be credited as comp-off within 60 days, subject to manager approval.</p>", requires_acknowledgement: true },
    { title: "Attendance & Hybrid Work Policy", category: "Time Off", version: "2.0", effective_date: "2026-04-01", summary: "Shift timings, punch-in rules, regularization and WFH guidelines.", content: "<h2>Shift</h2><p>Standard shift is 09:30–18:30 IST with a 15-minute grace period.</p><h2>Hybrid</h2><p>Teams work from office at least 3 days a week. Mark WFH while punching in remotely.</p><h2>Regularization</h2><p>Missed punches can be regularized within 30 days.</p>", requires_acknowledgement: true },
    { title: "Code of Conduct", category: "Conduct", version: "4.0", effective_date: "2026-01-01", summary: "How we work with each other, customers and partners.", content: "<p>We act with integrity, treat everyone with respect, protect company and customer data, and speak up when something is not right.</p><h3>Conflicts of interest</h3><p>Disclose any outside employment or investments that may conflict with your role.</p>", requires_acknowledgement: true },
    { title: "Travel & Expense Policy", category: "Finance", version: "1.4", effective_date: "2026-04-01", summary: "Eligible expenses, limits and how to claim.", content: "<table><tr><th>Category</th><th>Limit</th></tr><tr><td>Local travel</td><td>Actuals</td></tr><tr><td>Meals</td><td>₹1,500/day</td></tr><tr><td>Hotel (metro)</td><td>₹6,000/night</td></tr></table><p>Submit claims within 30 days with receipts.</p>" },
    { title: "Information Security Policy", category: "IT", version: "2.2", effective_date: "2026-02-01", summary: "Acceptable use, passwords, devices and data classification.", content: "<ul><li>Use SSO and MFA everywhere.</li><li>Never share customer data outside approved tools.</li><li>Report incidents to security@grevya.com within 1 hour.</li></ul>" },
    { title: "POSH Policy", category: "Conduct", version: "1.2", effective_date: "2025-12-01", summary: "Prevention of sexual harassment at the workplace.", content: "<p>Grevya has zero tolerance for sexual harassment. Complaints can be raised with the Internal Committee at ic@grevya.com.</p>", requires_acknowledgement: true },
    { title: "Remote Work Policy", category: "Workplace", version: "1.0", effective_date: "2026-07-01", summary: "Eligibility, expectations and equipment for working from home.", content: "<p>Confirmed employees may work remotely up to 2 days a week in agreement with their manager. Core collaboration hours are 11:00–17:00 IST.</p><p>Use Remote Check-in to punch in, work only on company devices and always connect through the VPN.</p>" },
  ]);
  // Policy documents (generated PDFs in scripts/assets/policies), stored in the HR admin's private folder.
  {
    const { readFileSync, statSync } = await import("node:fs");
    const { data: hr } = await db.from("employees").select("user_id").eq("email", "hr@grevya.com").single();
    const docs: [string, string][] = [
      ["Leave Policy", "leave-policy.pdf"],
      ["Attendance & Hybrid Work Policy", "attendance-hybrid-work-policy.pdf"],
      ["Code of Conduct", "code-of-conduct.pdf"],
      ["Travel & Expense Policy", "travel-expense-policy.pdf"],
      ["Information Security Policy", "information-security-policy.pdf"],
      ["POSH Policy", "posh-policy.pdf"],
      ["Remote Work Policy", "remote-work-policy.pdf"],
      ["Employee Handbook", "employee-handbook.pdf"],
    ];
    for (const [title, file] of hr?.user_id ? docs : []) {
      const local = `scripts/assets/policies/${file}`;
      if (!existsSync(local)) continue;
      const path = `${hr!.user_id}/policies/${file}`;
      const { error } = await db.storage.from("documents").upload(path, readFileSync(local), { contentType: "application/pdf", upsert: true });
      if (error) throw new Error(`policy document ${file}: ${error.message}`);
      const doc = { document_path: path, document_name: file, document_size: statSync(local).size, document_type: "application/pdf" };
      if (title === "Employee Handbook") {
        // Document-only policy (no text content), so it is created together with its file.
        await ins("policies", { title, category: "General", version: "2026.1", effective_date: "2026-01-01", summary: "Culture, benefits, timings, tools and who to ask for help — everything about working at Grevya.", content: null, requires_acknowledgement: true, ...doc });
      } else {
        await upd("policies", doc, { title });
      }
    }
  }
  await ins("faqs", [
    { category: "Leave", question: "How do I apply for leave?", answer: "Go to Leave → Apply Leave, choose the type and dates, add a reason and submit. Your manager is notified instantly.", sort_order: 1 },
    { category: "Leave", question: "Can I cancel an approved leave?", answer: "Yes — from Employee Leave Details you can cancel any approved leave that hasn't started. The balance is restored automatically.", sort_order: 2 },
    { category: "Attendance", question: "I forgot to punch in. What do I do?", answer: "Raise a regularization under Attendance → My Regularization within 30 days.", sort_order: 1 },
    { category: "Payroll", question: "When is salary credited?", answer: "Salary is credited on the last working day of each month. Payslips are published the same day under Payroll → My Slips.", sort_order: 1 },
    { category: "Payroll", question: "How do I choose between the old and new tax regime?", answer: "Use Payroll → Tax Calculator to compare, then select your regime in Investment Details.", sort_order: 2 },
    { category: "Reimbursement", question: "How long do claims take?", answer: "Claims are usually approved within 3 working days and paid in the next payroll cycle.", sort_order: 1 },
    { category: "General", question: "Who do I contact for HR questions?", answer: "Raise a ticket under More Apps → HR Helpdesk. The People Success team responds within one working day.", sort_order: 1 },
  ]);
  await ins("contracts", specs.map((s) => ({
    employee_id: E[s.key].id, title: s.type === "intern" ? "Internship Agreement" : "Employment Agreement", contract_type: s.type === "intern" ? "internship" : "employment",
    start_date: s.doj, end_date: s.type === "intern" ? addDays(s.doj, 183) : null, status: "active", created_by: E.ananya.id,
    terms: "Standard terms as per company policy, including confidentiality and IP assignment.",
  })));
  await ins("contracts", { employee_id: E.kavin.id, title: "Mutual Non-Disclosure Agreement", contract_type: "nda", start_date: E.kavin.date_of_joining, status: "active", created_by: E.ananya.id });
  await ins("letters", [
    { employee_id: E.kavin.id, letter_type: "appointment", category: "general", title: "Appointment Letter", issued_on: E.kavin.date_of_joining, issued_by: E.ananya.id, content: `<p>Dear Kavin,</p><p>We are delighted to appoint you as <strong>Senior AI Engineer</strong> in the Gen AI team at Grevya, effective ${E.kavin.date_of_joining}.</p><p>Your annual CTC will be <strong>₹24,00,000</strong>. You will report to Vikram Rao, Director - Engineering, and be based in Bangalore.</p><p>Welcome aboard!</p><p>Ananya Iyer<br/>Head - People Success</p>` },
    { employee_id: E.kavin.id, letter_type: "salary_certificate", category: "salary", title: "Salary Certificate", issued_on: "2026-09-15", issued_by: E.ananya.id, content: "<p>This is to certify that Kavin N R (GRV1004) is employed with Grevya as Senior AI Engineer and draws an annual CTC of ₹24,00,000.</p><p>This certificate is issued on the employee's request for loan processing.</p>" },
    { employee_id: E.priya.id, letter_type: "confirmation", category: "general", title: "Confirmation Letter", issued_on: "2024-08-12", issued_by: E.ananya.id, content: "<p>Dear Priya,</p><p>We are pleased to confirm your employment as AI Engineer effective 12 August 2024.</p>" },
  ]);
  await ins("letter_requests", { employee_id: E.priya.id, letter_type: "address_proof", purpose: "Bank account address update" });

  // Helpdesk, declarations, add-ons, announcements
  const [t1] = await ins<{ id: string }>("helpdesk_tickets", { employee_id: E.kavin.id, category: "Payroll", subject: "HRA not reflecting in September payslip", description: "I submitted rent receipts but HRA exemption isn't applied in TDS.", priority: "medium", status: "in_progress", assigned_to: E.divya.id });
  await ins("ticket_comments", [
    { ticket_id: t1.id, author_id: E.kavin.id, body: "Rent receipts were uploaded on 5 Sep." },
    { ticket_id: t1.id, author_id: E.divya.id, body: "Thanks Kavin — verifying with payroll, will update by Friday." },
  ]);
  await ins("helpdesk_tickets", [
    { employee_id: E.priya.id, category: "IT & Access", subject: "Need access to GPU cluster", description: "Requesting access to the shared A100 cluster for evaluation runs.", priority: "high" },
    { employee_id: E.aisha.id, category: "Documents & Letters", subject: "Employment verification for visa", description: "Need an employment verification letter for a Schengen visa.", priority: "medium" },
  ]);
  await ins("declaration_forms", [
    { title: "Conflict of Interest Declaration 2026", description: "Annual declaration of outside interests.", due_date: addDays(today, 30), created_by: E.ananya.id, fields: [
      { key: "outside_employment", label: "Do you hold any outside employment or consulting role?", type: "select", options: ["No", "Yes"], required: true },
      { key: "details", label: "If yes, please give details", type: "textarea" },
      { key: "relatives", label: "Do any relatives work at a Grevya customer or vendor?", type: "select", options: ["No", "Yes"], required: true },
      { key: "agree", label: "I confirm the above is true and complete", type: "checkbox", required: true },
    ] },
    { title: "Work From Home Setup", description: "Tell us about your home office so we can support you.", due_date: addDays(today, 14), created_by: E.ananya.id, fields: [
      { key: "internet", label: "Internet speed (Mbps)", type: "number", required: true },
      { key: "chair", label: "Do you have an ergonomic chair?", type: "select", options: ["Yes", "No"] },
      { key: "notes", label: "Anything else we should know?", type: "textarea" },
    ] },
  ]);
  await ins("addons", [
    { name: "Health Insurance", description: "Group medical cover, e-cards and claims", url: "https://www.irdai.gov.in", color: "#f97316", sort_order: 1 },
    { name: "Rewards & Recognition", description: "Send kudos and redeem points", url: "https://example.com/rewards", color: "#ec4899", sort_order: 2 },
    { name: "Travel Desk", description: "Book flights and hotels for business travel", url: "https://example.com/travel", color: "#ef4444", sort_order: 3 },
    { name: "Refer a Friend", description: "Share open roles with your network", url: "/recruit/jobs", color: "#1e3a8a", sort_order: 4 },
    { name: "IT Service Desk", description: "Laptops, access and software requests", url: "https://example.com/itsm", color: "#0ea5e9", sort_order: 5 },
    { name: "Wellness", description: "Counselling, fitness and wellbeing programs", url: "https://example.com/wellness", color: "#f59e0b", sort_order: 6 },
  ]);
  await ins("announcements", [
    { title: "Welcome to People Success 🎉", body: "Our new HR portal is live! Apply leave, check payslips, set goals and raise HR tickets — all in one place. Tap ♡ on pages you use often to pin them to Home.", pinned: true, created_by: E.ananya.id },
    { title: "Deepavali holiday on 10 November", body: "Office will remain closed on Tuesday, 10 November for Deepavali. Wishing you and your family a joyful festival of lights!", created_by: E.divya.id },
    { title: "FY 2026-27 goal setting is open", body: "Please add your goals for the annual cycle and submit them to your manager by 15 November.", created_by: E.ananya.id },
  ]);

  console.log("\nDemo data ready. Sign in with any of:");
  console.log("  admin@grevya.com   (Super Admin — accounts & roles)");
  console.log("  hr@grevya.com      (HR admin)");
  console.log("  kavin@grevya.com   (manager)");
  console.log("  priya@grevya.com   (employee)");
  console.log(`  password: ${PASSWORD}`);
}

function r2(n: number) {
  return Math.round(n * 100) / 100;
}
function workingDays(y: number, m: number, holidays: Set<string>) {
  let n = 0;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (let d = 1; d <= days; d++) {
    const s = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (!isWeekend(s) && !holidays.has(s)) n++;
  }
  return n;
}
function newRegimeTax(taxable: number) {
  if (taxable <= 1200000) return 0;
  const slabs: [number, number][] = [[400000, 0], [800000, 0.05], [1200000, 0.1], [1600000, 0.15], [2000000, 0.2], [2400000, 0.25], [Infinity, 0.3]];
  let tax = 0, prev = 0;
  for (const [cap, rate] of slabs) {
    if (taxable > prev) tax += (Math.min(taxable, cap) - prev) * rate;
    prev = cap;
  }
  tax = Math.min(tax, taxable - 1200000 + 0 > 0 ? tax : 0);
  return Math.round(tax * 1.04);
}

(async () => {
  try {
    if (args.has("--reset")) await reset();
    if (args.has("--minimal")) await seedMinimal();
    else await seedDemo();
  } catch (e) {
    console.error("\nSeed failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
})();
