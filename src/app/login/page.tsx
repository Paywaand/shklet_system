"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useLanguage } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import toast from "react-hot-toast";
import { Languages, Lock, User } from "lucide-react";

export default function LoginPage() {
  const { t, lang, toggleLang } = useLanguage();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === "TOO_MANY_ATTEMPTS") {
          toast.error(t("login.tooManyAttempts", { n: data.retryAfterMinutes }));
        } else {
          toast.error(t("login.invalidCredentials"));
        }
        return;
      }

      const role = data.user.role as "ADMIN" | "MANAGER" | "CASHIER";
      router.push(role === "CASHIER" ? "/cashier" : "/dashboard");
      router.refresh();
    } catch {
      toast.error(t("common.somethingWentWrong"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden bg-[#1b1a1e] px-4">
      {/* Decorative background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-shklet-red/25 blur-[120px]" />
        <div className="absolute -bottom-40 -right-20 h-96 w-96 rounded-full bg-shklet-purple/20 blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-shklet-yellow/10 blur-[130px]" />
      </div>

      <button
        onClick={toggleLang}
        className="absolute top-5 right-5 rtl:right-auto rtl:left-5 flex items-center gap-1.5 text-sm font-semibold px-3.5 h-9 rounded-full border border-white/15 bg-white/5 text-white/90 backdrop-blur-sm hover:bg-white/10 transition-colors z-10"
      >
        <Languages size={15} />
        {lang === "en" ? "کوردی" : "English"}
      </button>

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
        className="relative w-full max-w-[400px]"
      >
        <div className="rounded-3xl bg-[#242226]/90 backdrop-blur-xl border border-white/10 shadow-2xl p-8 sm:p-10">
          <div className="flex justify-center mb-7">
            <div className="h-16 w-16 rounded-2xl bg-shklet-red flex items-center justify-center shadow-[0_12px_32px_-8px_rgba(239,51,64,0.6)]">
              <span className="text-white font-black text-3xl">S</span>
            </div>
          </div>

          <h1 className="text-2xl font-extrabold text-center text-white tracking-[-0.02em] mb-1.5">
            {t("login.title")}
          </h1>
          <p className="text-sm text-white/40 text-center mb-8">Shklet Kiosk — Sales &amp; Management</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-white/60">{t("login.username")}</Label>
              <div className="relative">
                <User size={16} className="absolute left-3.5 rtl:left-auto rtl:right-3.5 top-1/2 -translate-y-1/2 text-white/30" />
                <Input
                  id="username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoFocus
                  className="ps-10 h-12 bg-white/[0.06] border-white/10 text-white placeholder:text-white/25 focus:border-shklet-red focus:bg-white/[0.08]"
                />
              </div>
            </div>
            <div>
              <Label className="text-white/60">{t("login.password")}</Label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 rtl:left-auto rtl:right-3.5 top-1/2 -translate-y-1/2 text-white/30" />
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="ps-10 h-12 bg-white/[0.06] border-white/10 text-white placeholder:text-white/25 focus:border-shklet-red focus:bg-white/[0.08]"
                />
              </div>
            </div>
            <Button type="submit" variant="primary" size="lg" className="w-full mt-2" loading={loading}>
              {loading ? t("login.signingIn") : t("login.signIn")}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
