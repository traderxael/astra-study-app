"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const formData = new FormData(event.currentTarget);
      const email = String(formData.get("email") ?? "");
      const password = String(formData.get("password") ?? "");
      const result = await signIn("credentials", {
        email,
        password,
        redirectTo: "/chat",
        redirect: false,
      });
      if (result?.error) {
        setError("Credenciales incorrectas. Intenta de nuevo.");
      } else {
        router.push(result?.url ?? "/chat");
        router.refresh();
      }
    } catch {
      setError("No se pudo iniciar sesión. Intenta de nuevo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main>
      <h1>Astra Study</h1>
      <p>Acceso privado.</p>
      <form onSubmit={onSubmit}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" />
        <label htmlFor="password">Contraseña</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={pending}>
          {pending ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
