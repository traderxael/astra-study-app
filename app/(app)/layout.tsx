import type { ReactNode } from "react";
import { requireSession } from "../../lib/auth-guard";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireSession();
  return <>{children}</>;
}
