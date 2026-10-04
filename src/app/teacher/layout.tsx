import { requireRole } from "@/lib/auth";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  await requireRole("TEACHER", "ADMIN");
  return <div className="app">{children}</div>;
}
