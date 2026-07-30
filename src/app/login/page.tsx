"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { apiSend } from "@/lib/client";
import { Spinner } from "@/components/ui";
import { LogIn } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // If the visitor already has a *valid* (DB-backed) session, skip the form and
  // go straight to the app. This replaces the old middleware /login → /pos
  // redirect, which looped because middleware can't see the DB session state.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => {
        if (!cancelled && res.ok) {
          router.replace("/pos");
          router.refresh();
        }
      })
      .catch(() => {
        /* not logged in — stay on the login form */
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiSend("/api/auth/login", "POST", { username, password });
      router.push("/pos");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-cream dark:bg-[var(--bg)]">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <Image
            src="/brand/whole_logo.png"
            alt="Shklet"
            width={180}
            height={180}
            priority
            className="w-40 h-auto"
          />
        </div>

        <form onSubmit={submit} className="card p-6">
          <h1 className="text-xl font-extrabold mb-1">Welcome back</h1>
          <p className="text-sm opacity-60 mb-5">Sign in to the Shklet system</p>

          <div className="mb-3">
            <label className="label">Username</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="none"
              autoComplete="username"
              autoFocus
              required
            />
          </div>

          <div className="mb-4">
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 font-semibold mb-3 text-center">{error}</p>
          )}

          <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
            {loading ? <Spinner className="size-5" /> : <LogIn size={18} />}
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
