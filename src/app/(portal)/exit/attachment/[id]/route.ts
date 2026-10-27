import { NextResponse, type NextRequest } from "next/server";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedDocumentUrl } from "@/lib/storage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Opens a resignation attachment. The row is fetched with the user's own
 * client, so RLS decides access (the employee, their approver chain, HR);
 * only then is a short-lived signed URL issued.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentEmployee();
  if (!me) return new NextResponse("Not signed in", { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return new NextResponse("Not found", { status: 404 });

  const supabase = await createClient();
  const { data } = await supabase.from("resignations").select("attachment_path").eq("id", id).maybeSingle();
  if (!data?.attachment_path) return new NextResponse("Not found", { status: 404 });

  const url = await signedDocumentUrl(data.attachment_path, 60);
  if (!url) return new NextResponse("File unavailable", { status: 404 });
  return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } });
}
