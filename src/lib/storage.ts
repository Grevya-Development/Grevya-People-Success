import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Upload a File from FormData to the private "documents" bucket under the
 * signed-in user's folder. Returns the storage path (store it in your row),
 * null when no file was provided, or throws with a friendly message.
 */
export async function uploadDocument(file: FormDataEntryValue | null, folder: string): Promise<string | null> {
  if (!file || typeof file === "string" || file.size === 0) return null;
  if (file.size > MAX_BYTES) throw new Error("File is larger than 10 MB");
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
  if (!path) return null;
  const admin = createAdminClient();
  const { data } = await admin.storage.from("documents").createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}

/** Upload an avatar image to the public "avatars" bucket; returns its public URL. */
export async function uploadAvatar(file: FormDataEntryValue | null): Promise<string | null> {
  if (!file || typeof file === "string" || file.size === 0) return null;
  if (file.size > 2 * 1024 * 1024) throw new Error("Image must be under 2 MB");
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file");
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
