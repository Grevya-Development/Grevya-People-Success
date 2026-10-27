import { redirect } from "next/navigation";

/** The Exit module opens on Resignation Status (MODULES[exit].href). */
export default function ExitIndex() {
  redirect("/exit/status");
}
