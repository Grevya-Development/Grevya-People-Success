"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, CameraOff, Loader2, LogIn, LogOut, MapPin, RefreshCw, RotateCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { remoteCheckIn, remoteCheckOut } from "../actions";

type Geo = { status: "idle" | "locating" | "ok" | "denied" | "unavailable"; lat?: number; lng?: number; accuracy?: number; message?: string };

const istTime = (d: Date) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).format(d);
const istDate = (d: Date) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "2-digit", month: "short", year: "numeric" }).format(d);

function subscribeClock(cb: () => void) {
  const id = window.setInterval(cb, 1000);
  return () => window.clearInterval(id);
}
const clockSnapshot = () => Math.floor(Date.now() / 1000) * 1000;

function elapsed(fromIso: string, now: number) {
  const m = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 60000));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

export function RemoteCapture({
  mode,
  employeeName,
  employeeCode,
  openSince,
}: {
  mode: "in" | "out";
  employeeName: string;
  employeeCode: string;
  openSince: string | null;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Live clock: null during server render so the HTML matches on hydration.
  const nowTick = useSyncExternalStore(subscribeClock, clockSnapshot, () => null);
  const now = nowTick ?? 0;
  const [camera, setCamera] = useState<"starting" | "live" | "error">("starting");
  const [cameraError, setCameraError] = useState("");
  const [geo, setGeo] = useState<Geo>({ status: "idle" });
  const [shot, setShot] = useState<{ url: string; blob: Blob } | null>(null);
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();


  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setCamera("starting");
    setCameraError("");
    stopCamera();
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera("error");
      setCameraError(window.isSecureContext ? "This browser can't open the camera." : "The camera needs a secure (https) connection.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCamera("live");
    } catch (e) {
      setCamera("error");
      const name = e instanceof DOMException ? e.name : "";
      setCameraError(
        name === "NotAllowedError"
          ? "Camera permission was blocked. Allow camera access in your browser's site settings, or upload a selfie below."
          : name === "NotFoundError"
            ? "No camera was found on this device. Upload a selfie below instead."
            : "Couldn't start the camera. Upload a selfie below instead.",
      );
    }
  }, [stopCamera]);

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setGeo({ status: "unavailable", message: "Location isn't supported by this browser." });
      return;
    }
    setGeo({ status: "locating" });
    navigator.geolocation.getCurrentPosition(
      (p) => setGeo({ status: "ok", lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      (err) =>
        setGeo({
          status: err.code === err.PERMISSION_DENIED ? "denied" : "unavailable",
          message: err.code === err.PERMISSION_DENIED ? "Location permission was blocked." : "Couldn't get your location.",
        }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }, []);

  useEffect(() => {
    // Kick off camera + location once on mount; both resolve asynchronously.
    const t = setTimeout(() => {
      void startCamera();
      locate();
    }, 0);
    return () => {
      clearTimeout(t);
      stopCamera();
    };
  }, [startCamera, locate, stopCamera]);

  /** Draw a source (video frame or uploaded image) to the canvas with a watermark. */
  const compose = useCallback(
    (source: CanvasImageSource, w: number, h: number) => {
      const canvas = canvasRef.current!;
      const scale = Math.min(1, 1280 / Math.max(w, h));
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

      const d = new Date();
      const lines = [
        `${employeeName} (${employeeCode}) · Remote ${mode === "in" ? "check-in" : "check-out"}`,
        `${istDate(d)} · ${istTime(d)} IST`,
        geo.status === "ok" ? `${geo.lat!.toFixed(5)}, ${geo.lng!.toFixed(5)} (±${geo.accuracy} m)` : "Location unavailable",
      ];
      const fs = Math.max(14, Math.round(canvas.width / 38));
      const pad = Math.round(fs * 0.7);
      const band = lines.length * fs * 1.35 + pad * 2;
      ctx.fillStyle = "rgba(8, 17, 63, 0.72)";
      ctx.fillRect(0, canvas.height - band, canvas.width, band);
      ctx.fillStyle = "#fff";
      ctx.font = `600 ${fs}px Roboto, system-ui, sans-serif`;
      ctx.textBaseline = "top";
      lines.forEach((l, i) => ctx.fillText(l, pad, canvas.height - band + pad + i * fs * 1.35));
      ctx.font = `700 ${Math.round(fs * 0.85)}px Roboto, system-ui, sans-serif`;
      const tag = "People Success";
      ctx.fillText(tag, canvas.width - pad - ctx.measureText(tag).width, canvas.height - band + pad);

      canvas.toBlob(
        (blob) => {
          if (!blob) return toast.error("Couldn't capture the photo");
          setShot((prev) => {
            if (prev) URL.revokeObjectURL(prev.url);
            return { url: URL.createObjectURL(blob), blob };
          });
        },
        "image/jpeg",
        0.85,
      );
    },
    [employeeName, employeeCode, mode, geo],
  );

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return toast.error("Camera isn't ready yet");
    compose(v, v.videoWidth, v.videoHeight);
  };

  const fromFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Please choose an image");
    const img = new Image();
    img.onload = () => {
      compose(img, img.naturalWidth, img.naturalHeight);
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  };

  const submit = () => {
    if (!shot) return;
    const fd = new FormData();
    fd.set("photo", new File([shot.blob], `selfie-${Date.now()}.jpg`, { type: "image/jpeg" }));
    if (geo.status === "ok") {
      fd.set("lat", String(geo.lat));
      fd.set("lng", String(geo.lng));
      fd.set("accuracy", String(geo.accuracy));
    }
    if (notes.trim()) fd.set("notes", notes.trim());
    startTransition(async () => {
      const res = await (mode === "in" ? remoteCheckIn : remoteCheckOut)(null, fd);
      if (res?.ok) {
        toast.success(res.message ?? "Saved");
        stopCamera();
        router.refresh();
      } else if (res?.error) toast.error(res.error);
    });
  };

  const nowDate = new Date(now);
  const isIn = mode === "in";

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <div className={cn("flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-white", isIn ? "bg-[#e3a91a]" : "bg-emerald-600")}>
        <div>
          <p className="text-sm font-semibold">{isIn ? "Remote Check-In" : "You're working remotely"}</p>
          <p className="text-xs text-white/85">{nowTick ? istDate(nowDate) : "\u00a0"}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-semibold tabular-nums">{nowTick ? istTime(nowDate) : "--:--:--"}</p>
          {!isIn && openSince && nowTick ? <p className="text-xs text-white/90">On the clock for {elapsed(openSince, now)}</p> : null}
        </div>
      </div>

      <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_260px]">
        {/* Camera / preview */}
        <div>
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-slate-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {shot && <img src={shot.url} alt="Captured selfie" className="absolute inset-0 h-full w-full object-cover" />}
            <video
              ref={videoRef}
              playsInline
              muted
              className={cn("absolute inset-0 h-full w-full -scale-x-100 object-cover", (shot || camera !== "live") && "invisible")}
            />
            {!shot && camera === "starting" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-white/80">
                <Loader2 className="h-6 w-6 animate-spin" /> Starting camera…
              </div>
            )}
            {!shot && camera === "error" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-sm text-white/85">
                <CameraOff className="h-8 w-8 text-white/60" />
                {cameraError}
                <Button size="sm" variant="secondary" onClick={() => void startCamera()}>
                  <RefreshCw className="h-3.5 w-3.5" /> Try again
                </Button>
              </div>
            )}
            {!shot && camera === "live" && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3 text-xs text-white">
                Centre your face in the frame
              </div>
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!shot ? (
              <>
                <Button onClick={capture} disabled={camera !== "live"}>
                  <Camera className="h-4 w-4" /> Take photo
                </Button>
                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  <Upload className="h-4 w-4" /> Upload selfie
                  <input type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => fromFile(e.target.files?.[0])} />
                </label>
              </>
            ) : (
              <Button variant="outline" onClick={() => setShot(null)} disabled={pending}>
                <RotateCcw className="h-4 w-4" /> Retake
              </Button>
            )}
          </div>
        </div>

        {/* Details + submit */}
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-slate-200 p-3 text-sm">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <MapPin className="h-3.5 w-3.5" /> Location
            </p>
            {geo.status === "locating" && (
              <p className="flex items-center gap-2 text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Getting your location…
              </p>
            )}
            {geo.status === "ok" && (
              <p className="text-slate-700">
                {geo.lat!.toFixed(5)}, {geo.lng!.toFixed(5)}
                <span className="block text-xs text-slate-400">Accuracy ±{geo.accuracy} m</span>
              </p>
            )}
            {(geo.status === "denied" || geo.status === "unavailable") && (
              <div>
                <p className="text-amber-700">{geo.message}</p>
                <p className="mt-0.5 text-xs text-slate-500">You can still continue — your manager will see that location was not shared.</p>
              </div>
            )}
            {geo.status !== "locating" && (
              <button type="button" onClick={locate} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline">
                <RefreshCw className="h-3 w-3" /> Refresh location
              </button>
            )}
          </div>

          {isIn && (
            <div>
              <label htmlFor="remote-notes" className="mb-1.5 block text-xs font-medium text-slate-600">
                What are you working on? <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <Textarea id="remote-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} placeholder="e.g. Sprint tasks, client call at 3 PM" />
            </div>
          )}

          <p className="text-xs leading-relaxed text-slate-500">
            Your photo, the server time, date, location and device are recorded with this {isIn ? "check-in" : "check-out"}.
          </p>

          <Button
            size="lg"
            variant={isIn ? "primary" : "danger"}
            className="mt-auto w-full"
            disabled={!shot || pending}
            onClick={submit}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : isIn ? <LogIn className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
            {isIn ? "Check In" : "Check Out"}
          </Button>
          {!shot && <p className="-mt-2 text-center text-xs text-slate-400">Take a photo to continue</p>}
        </div>
      </div>
    </div>
  );
}
