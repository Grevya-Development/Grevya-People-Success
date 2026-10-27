import { Clock, MapPin, MonitorSmartphone, Globe } from "lucide-react";
import { formatTime, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { deviceLabel, formatMinutes, mapLink, sessionMinutes, type RemoteSession } from "../_lib";
import { PhotoThumb } from "./photo-thumb";

function Side({
  label,
  at,
  photo,
  lat,
  lng,
  accuracy,
  ip,
  device,
}: {
  label: string;
  at: string | null;
  photo: string | null;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  ip: string | null;
  device: string | null;
}) {
  const map = mapLink(lat, lng);
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <PhotoThumb src={photo} label={`${label} photo${at ? " · " + formatDate(at, "dd MMM yyyy, hh:mm a") : ""}`} />
      {at ? (
        <ul className="mt-2 space-y-1 text-xs text-slate-600">
          <li className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="font-medium text-slate-800">{formatTime(at)}</span>
          </li>
          <li className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            {map ? (
              <a href={map} target="_blank" rel="noopener noreferrer" className="truncate text-primary-600 hover:underline">
                {lat!.toFixed(4)}, {lng!.toFixed(4)}
                {accuracy ? ` (±${Math.round(accuracy)} m)` : ""}
              </a>
            ) : (
              <span className="text-amber-700">Location not shared</span>
            )}
          </li>
          <li className="flex items-center gap-1.5">
            <MonitorSmartphone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="truncate">{deviceLabel(device)}</span>
          </li>
          {ip && (
            <li className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="truncate">{ip}</span>
            </li>
          )}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-slate-500">Not checked out yet</p>
      )}
    </div>
  );
}

export function SessionCard({ s, photos, showDate = false }: { s: RemoteSession; photos: Record<string, string>; showDate?: boolean }) {
  const open = !s.check_out_at;
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-800">
          {showDate && <span className="mr-2 text-slate-500">{formatDate(s.work_date, "EEE, dd MMM")}</span>}
          {formatTime(s.check_in_at)} – {open ? "now" : formatTime(s.check_out_at)}
        </div>
        <div className="flex items-center gap-2">
          {open ? <Badge tone="green">In progress</Badge> : null}
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">{formatMinutes(sessionMinutes(s))}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Side label="Check-in" at={s.check_in_at} photo={photos[s.check_in_photo] ?? null} lat={s.check_in_lat} lng={s.check_in_lng} accuracy={s.check_in_accuracy} ip={s.check_in_ip} device={s.check_in_device} />
        <Side label="Check-out" at={s.check_out_at} photo={s.check_out_photo ? photos[s.check_out_photo] ?? null : null} lat={s.check_out_lat} lng={s.check_out_lng} accuracy={s.check_out_accuracy} ip={s.check_out_ip} device={s.check_out_device} />
      </div>
      {s.notes && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{s.notes}</p>}
    </div>
  );
}
