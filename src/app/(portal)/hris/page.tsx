import type { Metadata } from "next";
import Link from "next/link";
import {
  FileSignature,
  FileText,
  UserCircle2,
  IndianRupee,
  Users,
  BookOpenCheck,
  Network,
  Inbox,
  Building2,
  ScrollText,
  UserPlus,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { profileCompletion } from "@/lib/profile";
import { cn, orgToday } from "@/lib/utils";
import { PageHeader, Card, ProgressRing } from "@/components/ui";
import { plusDays } from "./contracts/_lib";

export const metadata: Metadata = { title: "HRIS" };

type Tile = { href: string; label: string; icon: LucideIcon; stat: string; sub?: string; alert?: boolean };

export default async function HrisHome() {
  const me = await requireEmployee();
  const supabase = await createClient();
  const today = orgToday();
  const head = { count: "exact" as const, head: true };

  const contractsQ = supabase.from("contracts").select("id", head).eq("status", "active");
  const [
    contracts,
    expiring,
    letters,
    salaryLetters,
    headcount,
    policies,
    myAcks,
    ackPolicies,
    departments,
    priv,
    edu,
    exp,
    pendingRequests,
    myPendingRequests,
  ] = await Promise.all([
    me.isHR ? contractsQ.or(`end_date.is.null,end_date.gte.${today}`) : contractsQ.eq("employee_id", me.id),
    me.isHR
      ? supabase.from("contracts").select("id", head).eq("status", "active").gte("end_date", today).lte("end_date", plusDays(today, 30))
      : supabase.from("contracts").select("id", head).eq("employee_id", me.id).eq("status", "active").gte("end_date", today).lte("end_date", plusDays(today, 30)),
    supabase.from("letters").select("id", head).eq("employee_id", me.id).eq("category", "general"),
    supabase.from("letters").select("id", head).eq("employee_id", me.id).eq("category", "salary"),
    supabase.from("employees").select("id", head).neq("status", "exited"),
    supabase.from("policies").select("id", head).eq("published", true),
    supabase.from("policy_acknowledgements").select("policy_id").eq("employee_id", me.id),
    supabase.from("policies").select("id").eq("published", true).eq("requires_acknowledgement", true),
    supabase.from("departments").select("id", head),
    supabase
      .from("employee_private")
      .select("address, emergency_contact_name, emergency_contact_phone, pan_number, bank_account, personal_email")
      .eq("employee_id", me.id)
      .maybeSingle(),
    supabase.from("employee_education").select("id", head).eq("employee_id", me.id),
    supabase.from("employee_experience").select("id", head).eq("employee_id", me.id),
    me.isHR ? supabase.from("letter_requests").select("id", head).eq("status", "pending") : Promise.resolve({ count: 0 }),
    supabase.from("letter_requests").select("id", head).eq("employee_id", me.id).eq("status", "pending"),
  ]);

  const acked = new Set((myAcks.data ?? []).map((a) => a.policy_id));
  const pendingAcks = (ackPolicies.data ?? []).filter((p) => !acked.has(p.id)).length;
  const completion = profileCompletion(me, priv.data ?? null, edu.count ?? 0, exp.count ?? 0);
  const n = (v: number | null | undefined) => v ?? 0;
  const plural = (v: number, word: string) => `${v} ${word}${v === 1 ? "" : "s"}`;

  const tiles: Tile[] = [
    {
      href: "/hris/contracts",
      label: "Contract Management",
      icon: FileSignature,
      stat: plural(n(contracts.count), "active contract"),
      sub: n(expiring.count) ? `${n(expiring.count)} expiring in 30 days` : undefined,
      alert: n(expiring.count) > 0,
    },
    {
      href: "/hris/letters",
      label: "My Letters",
      icon: FileText,
      stat: plural(n(letters.count), "letter"),
      sub: n(myPendingRequests.count) ? `${n(myPendingRequests.count)} request${n(myPendingRequests.count) === 1 ? "" : "s"} pending` : undefined,
    },
    { href: "/profile", label: "My Profile", icon: UserCircle2, stat: `${completion.percent}% complete`, sub: completion.missing.length ? `${completion.missing.length} items to add` : "All set" },
    { href: "/hris/salary-letters", label: "My Salary Letters", icon: IndianRupee, stat: plural(n(salaryLetters.count), "letter") },
    { href: "/hris/employees", label: "Employee List", icon: Users, stat: plural(n(headcount.count), "employee") },
    {
      href: "/hris/policies",
      label: "Policies & FAQs",
      icon: BookOpenCheck,
      stat: `${n(policies.count)} ${n(policies.count) === 1 ? "policy" : "policies"}`,
      sub: pendingAcks ? `${pendingAcks} to acknowledge` : undefined,
      alert: pendingAcks > 0,
    },
    { href: "/hris/org-chart", label: "Organization Chart", icon: Network, stat: plural(n(departments.count), "department") },
  ];

  const adminTiles: Tile[] = me.isHR
    ? [
        {
          href: "/hris/admin/letters",
          label: "Letter Requests",
          icon: Inbox,
          stat: `${n(pendingRequests.count)} pending`,
          sub: "Approve, reject or issue letters",
          alert: n(pendingRequests.count) > 0,
        },
        { href: "/hris/admin/letters?tab=issue", label: "Issue a Letter", icon: ScrollText, stat: "11 templates", sub: "Offer to relieving" },
        { href: "/hris/admin/policies", label: "Manage Policies & FAQs", icon: BookOpenCheck, stat: "Publish & track", sub: "Acknowledgement tracking" },
        { href: "/hris/employees/new", label: "Add Employee", icon: UserPlus, stat: "Onboard", sub: "Create record & login" },
        { href: "/admin/org", label: "Departments & Locations", icon: Building2, stat: plural(n(departments.count), "department") },
      ]
    : [];

  return (
    <div>
      <PageHeader title="HRIS" description="Your employment records, letters, policies and the people around you." breadcrumbs={[{ label: "HRIS" }]} />

      <Card className="mb-6 flex flex-col gap-4 overflow-hidden p-5 sm:flex-row sm:items-center">
        <ProgressRing value={completion.percent} size={72} stroke={7} color="#5b74d6" track="#dce5fa">
          <span className="text-sm font-semibold text-slate-800">{completion.percent}%</span>
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-slate-800">Hi {me.first_name}, your profile is {completion.percent}% complete</p>
          <p className="mt-0.5 text-sm text-slate-500">
            {completion.missing.length
              ? `Add ${completion.missing.slice(0, 3).join(", ").toLowerCase()}${completion.missing.length > 3 ? ` and ${completion.missing.length - 3} more` : ""} to complete it.`
              : "Everything is up to date. Thank you!"}
          </p>
        </div>
        <Link
          href="/profile"
          className="inline-flex items-center gap-1.5 self-start rounded-full bg-[#dce5fa] px-4 py-2 text-sm font-medium text-[#3753b8] hover:bg-[#c9d7f7] sm:self-center"
        >
          Go to profile <ArrowRight className="h-4 w-4" />
        </Link>
      </Card>

      <TileGrid tiles={tiles} />

      {adminTiles.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">HR administration</h2>
          <TileGrid tiles={adminTiles} admin />
        </>
      )}
    </div>
  );
}

function TileGrid({ tiles, admin }: { tiles: Tile[]; admin?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {tiles.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className="group flex items-start gap-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-[#9fb1ec] hover:shadow-md"
        >
          <span
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
              admin ? "bg-[#e0e7ff] text-[#3730a3]" : "bg-[#dce5fa] text-[#3753b8]",
            )}
          >
            <t.icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800 group-hover:text-[#3753b8]">{t.label}</p>
            <p className="mt-0.5 text-xs font-medium text-slate-600">{t.stat}</p>
            {t.sub && <p className={cn("mt-1 text-xs", t.alert ? "font-medium text-amber-700" : "text-slate-500")}>{t.sub}</p>}
          </div>
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[#3753b8]" />
        </Link>
      ))}
    </div>
  );
}
