import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  hasLocalGuestPicks,
  stashWizardPlan,
  useSurvivor,
  WELCOME_DISMISSED_KEY,
} from "@/lib/survivor-store";
import { eligibleTeams, pct, WEEKS, type Plan } from "@/lib/survivor";

type Phase = "hidden" | "welcome" | "wizard" | "done";

function markDismissed() {
  try {
    window.sessionStorage.setItem(WELCOME_DISMISSED_KEY, "1");
  } catch {
    /* storage unavailable */
  }
}

function alreadyDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(WELCOME_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * First-visit welcome modal and pick wizard. Only ever shown to a signed-out
 * visitor with no local picks who hasn't closed it this session, and only when
 * the admin switch is on.
 */
export function WelcomeWizard() {
  const { session, slots, teamsById, setPick, plan, welcomeWizardEnabled, loading } = useSurvivor();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [phase, setPhase] = useState<Phase>("hidden");
  const [picked, setPicked] = useState<Plan>({});
  const [stepIndex, setStepIndex] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const decided = useRef(false);

  useEffect(() => {
    if (decided.current) return;
    if (loading || slots.size === 0) return;
    decided.current = true;
    if (session?.user) return;
    if (!welcomeWizardEnabled) return;
    if (alreadyDismissed()) return;
    if (hasLocalGuestPicks()) return;
    setPhase("welcome");
  }, [loading, slots.size, session?.user, welcomeWizardEnabled]);

  // A visitor who signs in mid-session never keeps the modal up.
  useEffect(() => {
    if (session?.user) setPhase("hidden");
  }, [session?.user]);

  const close = useCallback(() => {
    markDismissed();
    setPhase("hidden");
  }, []);

  const startWeeks = useMemo(
    () => WEEKS.filter((w) => !plan[w]),
    // Frozen when the wizard opens: the step list must not shrink as picks land.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase === "wizard"],
  );

  const current = useMemo(() => ({ ...plan, ...picked }), [plan, picked]);
  const week = startWeeks[stepIndex];

  const choose = useCallback(
    (w: number, teamId: string) => {
      setPick(w, teamId);
      const next = { ...current, [w]: teamId };
      setPicked((prev) => ({ ...prev, [w]: teamId }));
      setShowAll(false);
      if (WEEKS.every((x) => next[x])) setPhase("done");
      else setStepIndex((i) => i + 1);
    },
    [setPick, current],
  );

  /** Deliberately greedy, week by week — no lookahead, not the solver. */
  const autoPick = useCallback(() => {
    const next: Plan = { ...current };
    const used = new Set(Object.values(next).filter(Boolean) as string[]);
    for (const w of WEEKS) {
      if (next[w]) continue;
      const best = [...(slots.get(w)?.values() ?? [])]
        .filter((s) => !used.has(s.teamId))
        .sort((a, b) => b.winProb - a.winProb)[0];
      if (!best) continue;
      next[w] = best.teamId;
      used.add(best.teamId);
      setPick(w, best.teamId);
    }
    setPicked(next);
    setPhase("done");
  }, [current, slots, setPick]);

  const goAuth = useCallback(() => {
    stashWizardPlan(current);
    markDismissed();
    setPhase("hidden");
    void navigate({ to: "/auth" });
  }, [current, navigate]);

  if (phase === "hidden" || pathname.startsWith("/auth")) return null;

  const options = week ? eligibleTeams(slots, current, week) : [];
  const top5 = options.slice(0, 5);

  return (
    <div className="welcome-overlay" role="dialog" aria-modal="true" aria-label="Welcome">
      <button className="welcome-close btn" aria-label="Close welcome" onClick={close}>
        ✕
      </button>

      {phase === "welcome" ? (
        <div className="welcome-panel welcome-fade">
          <h1 className="welcome-title">Welcome to Survivor Ledger</h1>
          <p className="welcome-lede">
            Pick one NFL team a week, never twice, and see exactly how your season-long odds move.
            We can walk you through your first plan in a couple of minutes.
          </p>
          <div className="welcome-actions">
            <button className="btn primary" onClick={() => setPhase("wizard")}>
              Get started
            </button>
            <Link to="/auth" className="welcome-link" onClick={markDismissed}>
              Log in / create account
            </Link>
          </div>
        </div>
      ) : null}

      {phase === "wizard" && week ? (
        <div className="welcome-panel welcome-fade" key={week}>
          <div className="welcome-controls">
            <button className="btn" onClick={close}>
              Skip
            </button>
            <button className="btn" onClick={autoPick}>
              Auto-pick the rest
            </button>
          </div>
          <h1 className="welcome-title">Week {week}</h1>
          <p className="welcome-lede">Best available teams by win probability.</p>
          <div className="welcome-picks">
            {top5.map((s) => {
              const t = teamsById.get(s.teamId);
              return (
                <button
                  key={s.teamId}
                  className="welcome-pick"
                  onClick={() => choose(week, s.teamId)}
                >
                  {t?.logo_url ? (
                    <img src={t.logo_url} alt="" width={34} height={34} loading="lazy" />
                  ) : null}
                  <span className="welcome-pick-name">{t?.name ?? t?.abbr ?? s.teamId}</span>
                  <span className="welcome-pick-prob num">{pct(s.winProb)}</span>
                </button>
              );
            })}
            {top5.length === 0 ? <p className="sub">No teams available this week.</p> : null}
          </div>

          {showAll ? (
            <select
              className="control"
              autoFocus
              aria-label={`Choose any team for week ${week}`}
              defaultValue=""
              onChange={(e) => e.target.value && choose(week, e.target.value)}
            >
              <option value="">Choose a team…</option>
              {options.map((s) => (
                <option key={s.teamId} value={s.teamId}>
                  {teamsById.get(s.teamId)?.abbr} · {pct(s.winProb)}
                </option>
              ))}
            </select>
          ) : (
            <button className="welcome-link" onClick={() => setShowAll(true)}>
              Choose a different team
            </button>
          )}

          <div className="news-dots welcome-dots" aria-label="Progress">
            {startWeeks.map((w, i) => (
              <button
                key={w}
                type="button"
                aria-selected={i === stepIndex}
                aria-label={`Week ${w}`}
                onClick={() => setStepIndex(i)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {phase === "done" ? (
        <div className="welcome-panel welcome-fade">
          <h1 className="welcome-title">You're all set</h1>
          <p className="welcome-lede">
            All 18 weeks are filled. Save this plan to an account to keep it across devices, or
            carry on and it stays in this browser.
          </p>
          <div className="welcome-actions">
            <button className="btn primary" onClick={goAuth}>
              Sign up to save
            </button>
            <button className="btn" onClick={goAuth}>
              Log in
            </button>
            <button className="welcome-link" onClick={close}>
              Maybe later
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
