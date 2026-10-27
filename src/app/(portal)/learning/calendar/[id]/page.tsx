import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, CalendarDays, Clock, ExternalLink, MapPin, Pencil, UserRound, Users, Video, XCircle } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Avatar, Badge, Button, Card, CardBody, CardHeader, EmptyState, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { ActionButton } from "@/components/ui/action-button";
import { Dialog } from "@/components/ui/dialog";
import { cn, formatDateTime } from "@/lib/utils";
import { cancelRegistration, cancelTrainingSession, markAttendance, registerForSession, removeRegistrant } from "../../calendar-actions";
import { CourseProgress } from "../../_components/progress";
import { SessionForm } from "../../_components/session-form";
import { istDayLabel, istTimeRange } from "../../_lib/time";

export const metadata = { title: "Training Session" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TrainingSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireEmployee();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: s }, { data: seatData }, { data: myReg }] = await Promise.all([
    supabase.from("training_sessions").select("*, course:courses!training_sessions_course_id_fkey(id, title)").eq("id", id).maybeSingle(),
    supabase.rpc("training_session_seats"),
    supabase.from("training_registrations").select("id, attended").eq("session_id", id).eq("employee_id", me.id).maybeSingle(),
  ]);
  if (!s) notFound();

  const [{ data: attendeeData }, { data: courseData }] = me.isHR
    ? await Promise.all([
        supabase
          .from("training_registrations")
          .select("id, attended, registered_at, employee:employees!training_registrations_employee_id_fkey(full_name, avatar_url, employee_code, department:departments(name))")
          .eq("session_id", id)
          .order("registered_at"),
        supabase.from("courses").select("id, title").eq("published", true).order("title"),
      ])
    : [{ data: null }, { data: null }];
  const attendees = attendeeData ?? [];

  const taken = (seatData ?? []).find((r) => r.session_id === id)?.registered ?? 0;
  const left = Math.max(0, s.capacity - taken);
  const now = new Date().toISOString();
  const started = s.starts_at <= now;
  const ended = s.ends_at < now;
  const cancelled = s.status === "cancelled";
  const marked = attendees.filter((a) => a.attended !== null).length;
  const present = attendees.filter((a) => a.attended === true).length;

  return (
    <div>
      <PageHeader
        title={s.title}
        breadcrumbs={[{ label: "Learning", href: "/learning" }, { label: "Training Calendar", href: "/learning/calendar" }, { label: s.title }]}
        actions={
          me.isHR && !cancelled ? (
            <>
              <Dialog
                trigger={
                  <Button variant="outline">
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                }
                title="Edit session"
                size="lg"
              >
                <SessionForm session={s} courses={courseData ?? []} />
              </Dialog>
              {!ended && (
                <ActionButton action={cancelTrainingSession} fields={{ id: s.id }} variant="danger" size="md" confirm={`Cancel "${s.title}"? ${taken} registered employee(s) will be notified.`}>
                  <XCircle className="h-4 w-4" /> Cancel session
                </ActionButton>
              )}
            </>
          ) : undefined
        }
      />

      {cancelled && <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-200">This session has been cancelled.</p>}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardBody className="space-y-4 p-5">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <p className="flex items-start gap-2 text-slate-700">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[#3a95b3]" /> {istDayLabel(s.starts_at)}
              </p>
              <p className="flex items-start gap-2 text-slate-700">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#3a95b3]" /> {istTimeRange(s.starts_at, s.ends_at)}
              </p>
              <p className="flex items-start gap-2 text-slate-700">
                <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-[#3a95b3]" /> Trainer: {s.trainer}
              </p>
              <p className="flex min-w-0 items-start gap-2 text-slate-700">
                {s.mode === "virtual" ? <Video className="mt-0.5 h-4 w-4 shrink-0 text-[#3a95b3]" /> : <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#3a95b3]" />}
                <span className="min-w-0 break-words">{s.mode === "virtual" ? "Virtual session" : s.location}</span>
              </p>
              {s.course && (
                <p className="flex items-start gap-2 text-slate-700 sm:col-span-2">
                  <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-[#3a95b3]" /> Related course:{" "}
                  <Link href={`/learning/courses/${s.course.id}`} className="text-primary-600 hover:underline">
                    {s.course.title}
                  </Link>
                </p>
              )}
            </div>
            {s.description && <p className="whitespace-pre-line border-t border-slate-100 pt-4 text-sm text-slate-600">{s.description}</p>}
            {s.mode === "virtual" && s.meeting_link && (
              <div className="border-t border-slate-100 pt-4">
                {myReg || me.isHR ? (
                  <a href={s.meeting_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 break-all text-sm font-medium text-primary-600 hover:underline">
                    <ExternalLink className="h-4 w-4 shrink-0" /> Join meeting
                  </a>
                ) : (
                  <p className="text-xs text-slate-500">The meeting link is shown once you register.</p>
                )}
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Seats</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {left} <span className="text-sm font-normal text-slate-500">of {s.capacity} left</span>
          </p>
          <CourseProgress value={(taken / s.capacity) * 100} className="mt-2" />
          <div className="mt-4">
            {cancelled ? (
              <Badge tone="gray">Cancelled</Badge>
            ) : myReg ? (
              <div className="space-y-2">
                <Badge tone="teal">You&apos;re registered</Badge>
                {myReg.attended === true && <Badge tone="green" className="ml-2">Attended</Badge>}
                {myReg.attended === false && <Badge tone="red" className="ml-2">Marked absent</Badge>}
                {!started && (
                  <ActionButton action={cancelRegistration} fields={{ session_id: s.id }} confirm="Cancel your registration?" className="w-full">
                    Cancel registration
                  </ActionButton>
                )}
              </div>
            ) : started ? (
              <p className="text-xs text-slate-500">Registration has closed.</p>
            ) : (
              <ActionButton action={registerForSession} fields={{ session_id: s.id }} variant="primary" size="md" disabled={left === 0} className="w-full">
                {left === 0 ? "Session full" : "Register"}
              </ActionButton>
            )}
          </div>
        </Card>
      </div>

      {me.isHR && (
        <Card className="mt-5">
          <CardHeader
            title="Attendees"
            description={started ? `${taken} registered · ${present} present · ${marked}/${taken} marked` : `${taken} registered · attendance can be marked once the session starts`}
          />
          {attendees.length === 0 ? (
            <EmptyState icon={Users} title="No registrations yet" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Employee</TH>
                  <TH>Department</TH>
                  <TH>Registered</TH>
                  <TH>Attendance</TH>
                  <TH className="text-right">Actions</TH>
                </tr>
              </THead>
              <TBody>
                {attendees.map((a) => (
                  <TR key={a.id}>
                    <TD>
                      <div className="flex items-center gap-2">
                        <Avatar name={a.employee?.full_name} src={a.employee?.avatar_url} size="xs" />
                        <div>
                          <p className="whitespace-nowrap font-medium text-slate-800">{a.employee?.full_name}</p>
                          <p className="text-[11px] text-slate-400">{a.employee?.employee_code}</p>
                        </div>
                      </div>
                    </TD>
                    <TD className="whitespace-nowrap">{a.employee?.department?.name ?? "—"}</TD>
                    <TD className="whitespace-nowrap text-xs">{formatDateTime(a.registered_at)}</TD>
                    <TD>{a.attended === true ? <Badge tone="green">Present</Badge> : a.attended === false ? <Badge tone="red">Absent</Badge> : <span className="text-xs text-slate-400">Not marked</span>}</TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        {started && !cancelled && (
                          <>
                            <ActionButton
                              action={markAttendance}
                              fields={{ registration_id: a.id, attended: "true" }}
                              variant={a.attended === true ? "success" : "outline"}
                              className={cn(a.attended === true && "pointer-events-none")}
                            >
                              Present
                            </ActionButton>
                            <ActionButton
                              action={markAttendance}
                              fields={{ registration_id: a.id, attended: "false" }}
                              variant={a.attended === false ? "danger" : "outline"}
                              className={cn(a.attended === false && "pointer-events-none")}
                            >
                              Absent
                            </ActionButton>
                          </>
                        )}
                        {!started && (
                          <ActionButton action={removeRegistrant} fields={{ registration_id: a.id }} variant="ghost" confirm={`Remove ${a.employee?.full_name} from this session?`}>
                            Remove
                          </ActionButton>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}
