import { AppShell } from "@/components/layout/app-shell";
import { requireActiveProfile } from "@/features/auth/authorization";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  await requireActiveProfile();
  return <AppShell>{children}</AppShell>;
}
