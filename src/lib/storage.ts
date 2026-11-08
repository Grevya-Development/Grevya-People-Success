import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_BYTES = 10 * 1024 * 1024;

const startsWith = (bytes: Uint8Array, sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/**
 * Reject files whose contents don't match their type (a renamed file, a
 * truncated download, an empty "PDF"), so nobody later opens a "corrupted"
 * document. Unknown types pass through.
 */
async function assertReadable(file: File) {
  const name = file.name.toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  const type = file.type.toLowerCase();
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const damaged = (kind: string) => new Error(`“${file.name}” isn't a valid ${kind} file — it may be damaged. Please re-export or re-scan it and try again.`);

  if (ext === "pdf" || type === "application/pdf") {
    if (!startsWith(head, ascii("%PDF-"))) throw damaged("PDF");
    // Every complete PDF ends with a cross-reference pointer and an EOF marker.
    const tail = new TextDecoder("latin1").decode(await file.slice(Math.max(0, file.size - 2048)).arrayBuffer());
    if (!tail.includes("startxref") || !tail.includes("%%EOF")) throw damaged("PDF");
    return;
  }
  if (ext === "png" || type === "image/png") {
    if (!startsWith(head, [0x89, 0x50, 0x4e, 0x47])) throw damaged("PNG");
  } else if (["jpg", "jpeg"].includes(ext) || type === "image/jpeg") {
    if (!startsWith(head, [0xff, 0xd8, 0xff])) throw damaged("JPEG");
  } else if (ext === "gif" || type === "image/gif") {
    if (!startsWith(head, ascii("GIF8"))) throw damaged("GIF");
  } else if (ext === "webp" || type === "image/webp") {
    if (!startsWith(head, ascii("RIFF")) || !startsWith(head, ascii("WEBP"), 8)) throw damaged("WebP");
  } else if (["docx", "xlsx", "pptx"].includes(ext)) {
    if (!startsWith(head, [0x50, 0x4b, 0x03, 0x04])) throw damaged(ext.toUpperCase());
  } else if (["doc", "xls", "ppt"].includes(ext)) {
    if (!startsWith(head, [0xd0, 0xcf, 0x11, 0xe0])) throw damaged(ext.toUpperCase());
  }
}

/**
 * Upload a File from FormData to the private "documents" bucket under the
 * signed-in user's folder. Returns the storage path (store it in your row),
 * null when no file was provided, or throws with a friendly message.
 */
export async function uploadDocument(file: FormDataEntryValue | null, folder: string): Promise<string | null> {
  if (!file || typeof file === "string" || file.size === 0) return null;
  if (file.size > MAX_BYTES) throw new Error("File is larger than 10 MB");
  await assertReadable(file);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const path = `${user.id}/${folder}/${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase.storage.from("documents").upload(path, file, { contentType: file.type || undefined });
  if (error) throw new Error(error.message);
  return path;
}

/**
 * Short-lived download URL for a document path. Only call this AFTER the
 * caller has proven access to the owning row (e.g. it was returned by an
 * RLS-protected select), because it uses the service role.
 */
export async function signedDocumentUrl(path: string | null | undefined, expiresIn = 600): Promise<string | null> {
  // The storage API normalises "a/../b" into "b", so a path a user wrote into their own row
  // could otherwise point at anyone's file. Only sign plain, relative object paths.
  if (!path || /(^|\/)\.\.?(\/|$)|[\\%?#]|^\/|[\u0000-\u001f\u007f]/.test(path)) return null;
  const admin = createAdminClient();
  const { data } = await admin.storage.from("documents").createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}

/** Upload an avatar image to the public "avatars" bucket; returns its public URL. */
export async function uploadAvatar(file: FormDataEntryValue | null): Promise<string | null> {
  if (!file || typeof file === "string" || file.size === 0) return null;
  if (file.size > 2 * 1024 * 1024) throw new Error("Image must be under 2 MB");
  // Matches the avatars bucket's allowed types (no SVG: the bucket is public).
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) throw new Error("Please choose a JPG, PNG, WebP or GIF image");
  await assertReadable(file);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const path = `${user.id}/avatar-${Date.now()}`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type, upsert: true });
  if (error) throw new Error(error.message);
  return supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
}
