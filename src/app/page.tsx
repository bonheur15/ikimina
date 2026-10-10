import { redirect } from "next/navigation";
import { getViewer, homeFor } from "@/lib/auth/viewer";

export default async function Home() {
  const viewer = await getViewer();
  redirect(viewer ? homeFor(viewer) : "/login");
}
