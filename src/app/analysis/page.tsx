import { redirect } from "next/navigation";

export default function AnalysisRedirectPage() {
  redirect("/record?tab=summary");
}
