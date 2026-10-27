import Link from "next/link";
import { Bell } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDateTime } from "@/lib/utils";
import { Card, EmptyState, PageHeader, Button } from "@/components/ui";
import { LinkTabs } from "@/components/ui/link-tabs";
import { markAllNotificationsRead } from "../_actions";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireEmployee();
  const { tab } = await searchParams;
  const supabase = await createClient();
  let q = supabase.from("notifications").select("*").eq("employee_id", me.id).order("created_at", { ascending: false }).limit(200);
  if (tab === "unread") q = q.is("read_at", null);
  const [{ data }, { count }] = await Promise.all([
    q,
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("employee_id", me.id).is("read_at", null),
  ]);

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Updates on your requests, approvals and announcements."
        breadcrumbs={[{ label: "Home", href: "/home" }, { label: "Notifications" }]}
        actions={
          (count ?? 0) > 0 ? (
            <form action={markAllNotificationsRead}>
              <Button type="submit" variant="outline">
                Mark all as read
              </Button>
            </form>
          ) : null
        }
      />
      <LinkTabs
        tabs={[
          { label: "All", href: "/notifications" },
          { label: "Unread", href: "/notifications?tab=unread", count: count ?? 0 },
        ]}
      />
      <Card>
        {(data ?? []).length === 0 ? (
          <EmptyState icon={Bell} title={tab === "unread" ? "No unread notifications" : "No notifications yet"} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data!.map((n) => {
              const inner = (
                <div className={cn("flex gap-3 px-5 py-4", !n.read_at && "bg-primary-50/40")}>
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-slate-200" : "bg-primary-500")} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800">{n.title}</p>
                    {n.body && <p className="mt-0.5 text-sm text-slate-500">{n.body}</p>}
                    <p className="mt-1 text-xs text-slate-400">{formatDateTime(n.created_at)}</p>
                  </div>
                </div>
              );
              return <li key={n.id}>{n.link ? <Link href={n.link} className="block hover:bg-slate-50">{inner}</Link> : inner}</li>;
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
