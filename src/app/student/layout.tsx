import { requireRole } from "@/lib/auth";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  await requireRole("STUDENT");
  return <div className="app">{children}</div>;
}
