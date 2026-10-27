import Link from "next/link";
import { Search, SearchX } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Button, Card, EmptyState, Input, PageHeader, Select, buttonClass } from "@/components/ui";
import { cn, humanize } from "@/lib/utils";
import { CourseCard } from "../_components/course-card";
import { LEVELS, categoryStyle } from "../_lib/course";

export const metadata = { title: "Course Catalog" };

export default async function CatalogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireEmployee();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");
  const q = one(sp.q);
  const category = one(sp.category);
  const level = one(sp.level);
  const mandatoryOnly = one(sp.mandatory) === "1";

  const supabase = await createClient();
  const [{ data: allCourses }, { data: myEnrollments }] = await Promise.all([
    supabase
      .from("courses")
      .select("id, title, description, category, provider, level, duration_hours, modules, is_mandatory, published")
      .eq("published", true)
      .order("is_mandatory", { ascending: false })
      .order("title"),
    supabase.from("course_enrollments").select("course_id, status, progress").eq("employee_id", me.id),
  ]);

  const courses = allCourses ?? [];
  const categories = [...new Set(courses.map((c) => c.category))].sort();
  const counts = new Map<string, number>();
  courses.forEach((c) => counts.set(c.category, (counts.get(c.category) ?? 0) + 1));
  const enrollmentByCourse = new Map((myEnrollments ?? []).map((e) => [e.course_id, e]));

  const needle = q.toLowerCase();
  const filtered = courses.filter(
    (c) =>
      (!needle || c.title.toLowerCase().includes(needle) || (c.description ?? "").toLowerCase().includes(needle) || c.provider.toLowerCase().includes(needle)) &&
      (!category || c.category === category) &&
      (!level || c.level === level) &&
      (!mandatoryOnly || c.is_mandatory),
  );

  const chipHref = (cat: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (cat) p.set("category", cat);
    if (level) p.set("level", level);
    if (mandatoryOnly) p.set("mandatory", "1");
    const s = p.toString();
    return `/learning/catalog${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <PageHeader title="Course Catalog" description={`${courses.length} course${courses.length === 1 ? "" : "s"} available to you`} breadcrumbs={[{ label: "Learning", href: "/learning" }, { label: "Course Catalog" }]} />

      <Card className="mb-4 p-4">
        <form className="grid gap-3 sm:grid-cols-[1fr_180px_160px_auto_auto]" action="/learning/catalog">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input name="q" defaultValue={q} placeholder="Search courses, topics, providers" className="pl-9" aria-label="Search courses" />
          </div>
          <Select name="category" defaultValue={category} aria-label="Category">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select name="level" defaultValue={level} aria-label="Level">
            <option value="">All levels</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {humanize(l)}
              </option>
            ))}
          </Select>
          <label className="inline-flex items-center gap-2 whitespace-nowrap text-sm text-slate-700">
            <input type="checkbox" name="mandatory" value="1" defaultChecked={mandatoryOnly} className="h-4 w-4 rounded border-slate-300" />
            Mandatory only
          </label>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1 sm:flex-none">
              Apply
            </Button>
            {(q || category || level || mandatoryOnly) && (
              <Link href="/learning/catalog" className={buttonClass("ghost")}>
                Reset
              </Link>
            )}
          </div>
        </form>
      </Card>

      {categories.length > 0 && (
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1 thin-scroll">
          <Link
            href={chipHref("")}
            className={cn(
              "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition",
              !category ? "bg-[#3a95b3] text-white ring-[#3a95b3]" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
            )}
          >
            All · {courses.length}
          </Link>
          {categories.map((c) => {
            const s = categoryStyle(c);
            const active = c === category;
            return (
              <Link
                key={c}
                href={chipHref(active ? "" : c)}
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition",
                  active ? s.chip : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", s.dot)} />
                {c} · {counts.get(c)}
              </Link>
            );
          })}
        </div>
      )}

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={SearchX}
            title={courses.length === 0 ? "The catalog is empty" : "No courses match your filters"}
            description={courses.length === 0 ? "HR hasn't published any courses yet. Check back soon." : "Try a different search term or clear the filters."}
            action={
              courses.length > 0 ? (
                <Link href="/learning/catalog" className={buttonClass("secondary", "sm")}>
                  Clear filters
                </Link>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((c) => (
            <CourseCard key={c.id} course={c} enrollment={enrollmentByCourse.get(c.id) ?? null} />
          ))}
        </div>
      )}
    </div>
  );
}
