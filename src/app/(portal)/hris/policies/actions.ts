"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ok, fail, dbError, type ActionState } from "@/lib/actions";
import { str } from "@/lib/utils";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function acknowledgePolicy(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await getCurrentEmployee();
  if (!me) return fail("Not signed in");
  const id = str(fd, "id");
  if (!id || !UUID.test(id)) return fail("Invalid policy");

  const supabase = await createClient();
  const { data: policy } = await supabase
    .from("policies")
    .select("id, published, requires_acknowledgement")
    .eq("id", id)
    .maybeSingle();
  if (!policy || (!policy.published && !me.isHR)) return fail("Policy not found");
  if (!policy.requires_acknowledgement) return fail("This policy does not require acknowledgement");

  const { data: existing } = await supabase
    .from("policy_acknowledgements")
    .select("policy_id")
    .eq("policy_id", id)
    .eq("employee_id", me.id)
    .maybeSingle();
  if (existing) return ok("Already acknowledged");

  const { error } = await supabase.from("policy_acknowledgements").insert({ policy_id: id, employee_id: me.id });
  if (error) return fail(dbError(error));
  revalidatePath("/hris/policies");
  revalidatePath(`/hris/policies/${id}`);
  revalidatePath("/hris/admin/policies");
  return ok("Thank you — your acknowledgement is recorded");
}
