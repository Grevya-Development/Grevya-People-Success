import type { Metadata } from "next";
import { LettersView } from "../letters/_components/letters-view";

export const metadata: Metadata = { title: "My Salary Letters" };

export default function MySalaryLettersPage() {
  return <LettersView category="salary" />;
}
