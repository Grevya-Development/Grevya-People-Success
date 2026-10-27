import { NextResponse, type NextRequest } from "next/server";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fileKind, isViewable } from "../../_lib/files";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Opens a policy's document. Employees may only open published policies; HR
 * may open drafts too. Access is checked here before a 60-second signed URL
 * is issued (the file itself lives in HR's private storage folder).
 * `?download=1` forces a download; non-viewable types always download.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentEmployee();
  if (!me) return new NextResponse("Not signed in", { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return new NextResponse("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: policy } = await supabase
    .from("policies")
    .select("published, document_path, document_name, document_type")
    .eq("id", id)
    .maybeSingle();
  if (!policy || (!policy.published && !me.isHR) || !policy.document_path) {
    return new NextResponse("Not found", { status: 404 });
  }

  const download = req.nextUrl.searchParams.get("download") === "1" || !isViewable(fileKind(policy.document_name, policy.document_type));
  const admin = createAdminClient();
  const { data } = await admin.storage
    .from("documents")
    .createSignedUrl(policy.document_path, 60, download ? { download: policy.document_name ?? true } : undefined);
  if (!data?.signedUrl) return new NextResponse("File unavailable", { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "no-store" } });
}
