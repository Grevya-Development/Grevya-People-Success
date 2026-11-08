import Image from "next/image";
import { buttonClass } from "@/components/ui/button";
import { signOut } from "@/app/(portal)/_actions";

export const metadata = { title: "No employee profile" };

export default async function NoAccess({ searchParams }: { searchParams: Promise<{ disabled?: string }> }) {
  const disabled = (await searchParams).disabled === "1";
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <Image src="/grevya-mark.png" alt="" width={56} height={56} className="mx-auto h-14 w-14" />
        <h1 className="mt-5 text-xl font-semibold text-slate-900">
          {disabled ? "Your login has been disabled" : "Your account isn\u2019t linked to an employee profile yet"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {disabled
            ? "Please contact your HR team if you think this is a mistake."
            : "Ask your HR team to add you in People Success using the same email address you signed in with."}
        </p>
        <form action={signOut} className="mt-6">
          <button className={buttonClass("outline")}>Sign out</button>
        </form>
      </div>
    </div>
  );
}
