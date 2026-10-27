import { NextResponse, type NextRequest } from "next/server";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedDocumentUrl } from "@/lib/storage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Redirects to a short-lived URL for the contract document, after an RLS-checked read. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentEmployee();
  if (!me) return new NextResponse("Not signed in", { status: 401 });
  if (!UUID.test(id)) return new NextResponse("Not found", { status: 404 });

  const supabase = await createClient();
  // RLS: the employee's own contracts, or any contract for HR.
  const { data } = await supabase.from("contracts").select("document_url").eq("id", id).maybeSingle();
  if (!data?.document_url) return new NextResponse("Document not found", { status: 404 });

  const url = await signedDocumentUrl(data.document_url, 120);
  if (!url) return new NextResponse("Document unavailable", { status: 404 });
  return NextResponse.redirect(url);
}
