import type { DefaultSession } from "next-auth";

// La sesión siempre lleva id (`auth()` devuelve { id: "admin", ... });
// sin esta augumentación `session.user.id` es `string | undefined` y
// `next build` falla en las páginas privadas.
declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
  interface User {
    id: string;
  }
}
