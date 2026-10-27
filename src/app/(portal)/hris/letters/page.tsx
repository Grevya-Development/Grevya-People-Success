import type { Metadata } from "next";
import { LettersView } from "./_components/letters-view";

export const metadata: Metadata = { title: "My Letters" };

export default function MyLettersPage() {
  return <LettersView category="general" />;
}
