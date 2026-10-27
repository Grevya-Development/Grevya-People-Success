import {
  FileText,
  Target,
  UserX,
  PersonStanding,
  CalendarDays,
  ReceiptIndianRupee,
  HandCoins,
  BookOpen,
  Users,
  Contact,
  MoreHorizontal,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type Audience = "all" | "manager" | "hr";

export type NavLeaf = {
  key: string;
  label: string;
  href: string;
  /** who can see it (default: all) */
  audience?: Audience;
  /** hide the favourite heart */
  noFavorite?: boolean;
};

export type NavGroup = {
  key: string;
  label: string;
  audience?: Audience;
  children: NavLeaf[];
};

export type NavItem = NavLeaf | NavGroup;

export type ModuleTheme = {
  /** pill background */ pill: string;
  /** pill hover */ pillHover: string;
  /** accent text / icon */ text: string;
  /** solid accent for chips & headers */ solid: string;
};

export type NavModule = {
  key: string;
  label: string;
  icon: LucideIcon;
  theme: ModuleTheme;
  audience?: Audience;
  /** module landing page (also used when the module is clicked) */
  href: string;
  items: NavItem[];
  /** link straight to href without a flyout (e.g. Directory) */
  direct?: boolean;
};

export const isGroup = (i: NavItem): i is NavGroup => "children" in i;

const t = (pill: string, pillHover: string, text: string, solid: string): ModuleTheme => ({ pill, pillHover, text, solid });

export const MODULES: NavModule[] = [
  {
    key: "hris",
    label: "HRIS",
    icon: FileText,
    href: "/hris",
    theme: t("bg-[#dce5fa]", "hover:bg-[#c9d7f7]", "text-[#3753b8]", "bg-[#5b74d6]"),
    items: [
      { key: "hris.contracts", label: "Contract Management", href: "/hris/contracts" },
      { key: "hris.letters", label: "My Letters", href: "/hris/letters" },
      { key: "hris.profile", label: "My Profile", href: "/profile" },
      { key: "hris.salary-letters", label: "My Salary Letters", href: "/hris/salary-letters" },
      { key: "hris.employees", label: "Employee List", href: "/hris/employees" },
      { key: "hris.policies", label: "Policies & FAQs", href: "/hris/policies" },
      { key: "hris.org-chart", label: "Organization Chart", href: "/hris/org-chart" },
    ],
  },
  {
    key: "performance",
    label: "Performance",
    icon: Target,
    href: "/performance",
    theme: t("bg-[#d9e7f5]", "hover:bg-[#c5dbf0]", "text-[#2f6aa8]", "bg-[#4a8ad0]"),
    items: [
      { key: "performance.home", label: "Performance Home", href: "/performance" },
      {
        key: "performance.goal",
        label: "Goal",
        children: [
          { key: "performance.my-goals", label: "My Goals", href: "/performance/goals" },
          { key: "performance.team-goals", label: "My Team Goals", href: "/performance/team-goals", audience: "manager" },
          { key: "performance.objective-tree", label: "Objective Tree", href: "/performance/objective-tree" },
          { key: "performance.new-goal", label: "Create new Goal", href: "/performance/goals/new" },
        ],
      },
      {
        key: "performance.reviews",
        label: "Reviews",
        children: [
          { key: "performance.my-reviews", label: "My Reviews", href: "/performance/reviews" },
          { key: "performance.team-reviews", label: "My Team Reviews", href: "/performance/team-reviews", audience: "manager" },
        ],
      },
    ],
  },
  {
    key: "exit",
    label: "Exit",
    icon: UserX,
    href: "/exit/status",
    theme: t("bg-[#f7dcd8]", "hover:bg-[#f2c9c3]", "text-[#b2463a]", "bg-[#d9675a]"),
    items: [
      { key: "exit.resign", label: "My Resignation", href: "/exit/resign" },
      { key: "exit.status", label: "Resignation Status", href: "/exit/status" },
      { key: "exit.approvals", label: "Exit Approvals", href: "/exit/approvals", audience: "manager" },
    ],
  },
  {
    key: "leave",
    label: "Leave",
    icon: PersonStanding,
    href: "/leave/apply",
    theme: t("bg-[#fbe2d2]", "hover:bg-[#f8d1b8]", "text-[#c2581c]", "bg-[#ec7a35]"),
    items: [
      { key: "leave.apply", label: "Apply Leave", href: "/leave/apply" },
      { key: "leave.details", label: "Employee Leave Details", href: "/leave/details" },
      { key: "leave.holidays", label: "Holiday Calendar", href: "/leave/holidays" },
      { key: "leave.approvals", label: "Leave Approvals", href: "/leave/approvals", audience: "manager" },
    ],
  },
  {
    key: "attendance",
    label: "Attendance",
    icon: CalendarDays,
    href: "/attendance",
    theme: t("bg-[#f8ebc8]", "hover:bg-[#f4e0aa]", "text-[#a87a0c]", "bg-[#e3a91a]"),
    items: [
      { key: "attendance.team", label: "Team Attendance Status", href: "/attendance/team", audience: "manager" },
      { key: "attendance.regularization", label: "My Regularization", href: "/attendance/regularization" },
      { key: "attendance.bulk-approval", label: "Attendance Bulk Approval", href: "/attendance/bulk-approval", audience: "manager" },
      { key: "attendance.my", label: "My Attendance", href: "/attendance/my" },
      { key: "attendance.compoff", label: "Apply Compoff", href: "/attendance/compoff" },
      { key: "attendance.home", label: "Attendance Home", href: "/attendance" },
      { key: "attendance.remote", label: "Remote Check-In", href: "/attendance/remote" },
      { key: "attendance.remote-log", label: "Remote Work Log", href: "/attendance/remote/history" },
      { key: "attendance.remote-team", label: "Remote Attendance Report", href: "/attendance/remote/team", audience: "manager" },
      { key: "attendance.calendar", label: "Calendar View", href: "/attendance/calendar" },
    ],
  },
  {
    key: "payroll",
    label: "Payroll",
    icon: ReceiptIndianRupee,
    href: "/payroll/slips",
    theme: t("bg-[#e2eed4]", "hover:bg-[#d3e5bf]", "text-[#4f7a1f]", "bg-[#78a83a]"),
    items: [
      { key: "payroll.vpf", label: "VPF Declaration", href: "/payroll/vpf" },
      { key: "payroll.slips", label: "My Slips", href: "/payroll/slips" },
      { key: "payroll.tax", label: "Tax Calculator", href: "/payroll/tax-calculator" },
      { key: "payroll.fbp", label: "FBP", href: "/payroll/fbp" },
      { key: "payroll.ctc", label: "CTC Reimbursement", href: "/payroll/ctc-reimbursement" },
      { key: "payroll.investments", label: "Investment Details", href: "/payroll/investments" },
    ],
  },
  {
    key: "reimbursement",
    label: "Reimbursement",
    icon: HandCoins,
    href: "/reimbursement/claims",
    theme: t("bg-[#eff0d2]", "hover:bg-[#e6e8b9]", "text-[#7c7a17]", "bg-[#b3ad2a]"),
    items: [
      { key: "reimbursement.new", label: "Raise New Claim", href: "/reimbursement/new" },
      { key: "reimbursement.claims", label: "My Claims", href: "/reimbursement/claims" },
      { key: "reimbursement.approvals", label: "Claim Approvals", href: "/reimbursement/approvals", audience: "manager" },
    ],
  },
  {
    key: "learning",
    label: "Learning",
    icon: BookOpen,
    href: "/learning",
    theme: t("bg-[#d5e9f0]", "hover:bg-[#c0dde8]", "text-[#25708a]", "bg-[#3a95b3]"),
    items: [
      { key: "learning.home", label: "Learning Home", href: "/learning" },
      { key: "learning.my-courses", label: "My Courses", href: "/learning/my-courses" },
      { key: "learning.catalog", label: "Course Catalog", href: "/learning/catalog" },
      { key: "learning.plan", label: "My Learning Plan", href: "/learning/plan" },
      { key: "learning.certificates", label: "My Certificates", href: "/learning/certificates" },
      { key: "learning.team", label: "My Team Learning", href: "/learning/team", audience: "manager" },
    ],
  },
  {
    key: "recruit",
    label: "Recruit",
    icon: Users,
    href: "/recruit",
    theme: t("bg-[#e6e0f1]", "hover:bg-[#dad1ec]", "text-[#6a4fa3]", "bg-[#8a6cc6]"),
    items: [
      { key: "recruit.home", label: "Home", href: "/recruit" },
      {
        key: "recruit.referral",
        label: "Employee Referral Jobs",
        children: [
          { key: "recruit.my-referrals", label: "My Referrals", href: "/recruit/referrals" },
          { key: "recruit.jobs", label: "Employee Referral Jobs", href: "/recruit/jobs" },
        ],
      },
    ],
  },
  {
    key: "directory",
    label: "Directory",
    icon: Contact,
    href: "/directory",
    direct: true,
    theme: t("bg-[#e3e8f0]", "hover:bg-[#d4dbe7]", "text-[#475569]", "bg-[#64748b]"),
    items: [{ key: "directory", label: "Directory", href: "/directory" }],
  },
  {
    key: "apps",
    label: "More Apps",
    icon: MoreHorizontal,
    href: "/apps/helpdesk",
    theme: t("bg-[#eef1f6]", "hover:bg-[#e2e7ef]", "text-[#475569]", "bg-[#64748b]"),
    items: [
      { key: "apps.declarations", label: "Declaration App", href: "/apps/declarations" },
      { key: "apps.helpdesk", label: "HR Helpdesk", href: "/apps/helpdesk" },
    ],
  },
  {
    key: "admin",
    label: "HR Admin",
    icon: ShieldCheck,
    href: "/hris/employees",
    audience: "hr",
    theme: t("bg-[#e0e7ff]", "hover:bg-[#cfd9fe]", "text-[#3730a3]", "bg-[#4f46e5]"),
    items: [
      { key: "admin.employees", label: "Employees", href: "/hris/employees" },
      { key: "admin.org", label: "Departments & Locations", href: "/admin/org" },
      { key: "admin.letters", label: "Letters & Contracts", href: "/hris/admin/letters" },
      { key: "admin.policies", label: "Policies & FAQs", href: "/hris/admin/policies" },
      { key: "admin.leave", label: "Leave & Holidays Setup", href: "/leave/admin" },
      { key: "admin.payroll", label: "Payroll Run & Salary", href: "/payroll/admin" },
      { key: "admin.performance", label: "Review Cycles", href: "/performance/admin" },
      { key: "admin.exit", label: "Exit Management", href: "/exit/approvals" },
      { key: "admin.learning", label: "Learning Admin", href: "/learning/admin" },
      { key: "admin.recruit", label: "Recruitment", href: "/recruit/admin" },
      { key: "admin.helpdesk", label: "Helpdesk Queue", href: "/apps/helpdesk/queue" },
      { key: "admin.declarations", label: "Declaration Forms", href: "/apps/declarations/admin" },
      { key: "admin.announcements", label: "Announcements", href: "/admin/announcements" },
      { key: "admin.addons", label: "Add-ons", href: "/admin/addons" },
    ],
  },
];

export type Viewer = { isManager: boolean; isHR: boolean };

export function canSee(audience: Audience | undefined, v: Viewer) {
  if (!audience || audience === "all") return true;
  if (audience === "manager") return v.isManager;
  return v.isHR;
}

/** Modules filtered to what this viewer can access. Serializable keys only. */
export function visibleModuleKeys(v: Viewer) {
  return MODULES.filter((m) => canSee(m.audience, v)).map((m) => m.key);
}

/** Flat list of every leaf, with its module — used by search and favourites. */
export function allLeaves(v?: Viewer) {
  const out: (NavLeaf & { moduleKey: string; moduleLabel: string })[] = [];
  for (const m of MODULES) {
    if (v && !canSee(m.audience, v)) continue;
    for (const item of m.items) {
      if (isGroup(item)) {
        if (v && !canSee(item.audience, v)) continue;
        for (const c of item.children) {
          if (v && !canSee(c.audience, v)) continue;
          out.push({ ...c, moduleKey: m.key, moduleLabel: m.label });
        }
      } else {
        if (v && !canSee(item.audience, v)) continue;
        out.push({ ...item, moduleKey: m.key, moduleLabel: m.label });
      }
    }
  }
  return out;
}

export function findLeaf(key: string) {
  return allLeaves().find((l) => l.key === key);
}

export function moduleFor(key: string) {
  return MODULES.find((m) => m.key === key);
}
