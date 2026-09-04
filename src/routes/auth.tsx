import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Survivor Ledger" },
      {
        name: "description",
        content:
          "Sign in to save your NFL Survivor pool plan across devices and manage multiple league entries.",
      },
      { property: "og:title", content: "Sign in — Survivor Ledger" },
      {
        property: "og:description",
        content: "Save your NFL Survivor season plan and manage multiple league entries.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      setBusy(false);
      if (error) return setMessage(error.message);
      if (!data.session) return setMessage("Check your email to confirm your account.");
      navigate({ to: "/" });
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) return setMessage(error.message);
      navigate({ to: "/" });
    }
  }

  async function google() {
    setMessage(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) return setMessage("Google sign-in failed. Try email instead.");
    if (result.redirected) return;
    navigate({ to: "/" });
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background: "var(--bg)" }}
    >
      <div className="card" style={{ width: 380, maxWidth: "100%" }}>
        <div className="brand" style={{ marginBottom: 14 }}>
          <span className="brand-mark" aria-hidden="true">
            SL
          </span>
          <span className="brand-name">Survivor Ledger</span>
        </div>
        <h2>{mode === "signin" ? "Sign in" : "Create account"}</h2>
        <p className="sub" style={{ marginTop: 6, marginBottom: 14 }}>
          Signing in saves your plan to your league entries. You can keep planning as a guest —
          nothing is lost.
        </p>

        <button className="btn" style={{ width: "100%" }} onClick={() => void google()}>
          Continue with Google
        </button>

        <div className="label faint" style={{ textAlign: "center", margin: "12px 0" }}>
          or
        </div>

        <form onSubmit={submit} className="flex flex-col gap-2">
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="control"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="control"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="btn primary" style={{ marginTop: 8 }} type="submit" disabled={busy}>
            {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        {message ? (
          <p className="sub" style={{ marginTop: 10, color: "var(--critical)" }}>
            {message}
          </p>
        ) : null}

        <div className="flex items-center justify-between" style={{ marginTop: 14 }}>
          <button
            className="btn"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            type="button"
          >
            {mode === "signin" ? "Create an account" : "I have an account"}
          </button>
          <button className="btn" type="button" onClick={() => navigate({ to: "/" })}>
            Continue as guest
          </button>
        </div>
      </div>
    </div>
  );
}
