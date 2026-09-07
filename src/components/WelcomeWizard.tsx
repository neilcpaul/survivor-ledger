import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  hasLocalGuestPicks,
  stashWizardPlan,
  useSurvivor,
  WELCOME_DISMISSED_KEY,
} from "@/lib/survivor-store";
import { eligibleTeams, pct, WEEKS, type Plan } from "@/lib/survivor";

const SWIPE_THRESHOLD = 56;

type Phase = "hidden" | "welcome" | "wizard" | "done";

/** Fired from the nav to open the wizard on demand, for anyone. */
export const OPEN_WIZARD_EVENT = "survivor:open-wizard";

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

function isInteractiveTarget(target: EventTarget | null): boolean {
  const el = target instanceof HTMLElement ? target : null;
  if (!el) return false;
  const tag = el.tagName;
  if (["BUTTON", "A", "SELECT", "INPUT", "TEXTAREA"].includes(tag)) return true;
  if (el.closest("button, a, select, input, textarea, [role='button']")) return true;
  return false;
}


/**
 * First-visit welcome modal and pick wizard. Shown automatically to a signed-out
 * visitor with no local picks who hasn't closed it this session (and only when
 * the admin switch is on), or on demand from the "Pick Wizard" nav item — which
 * walks every week and may overwrite existing picks.
 */
export function WelcomeWizard() {
  const { session, slots, teamsById, setPick, plan, welcomeWizardEnabled, loading } = useSurvivor();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [phase, setPhase] = useState<Phase>("hidden");
  const [picked, setPicked] = useState<Plan>({});
  const [stepIndex, setStepIndex] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [steps, setSteps] = useState<number[]>([]);
  const [manual, setManual] = useState(false);
  const decided = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const goStep = useCallback(
    (dir: 1 | -1) => setStepIndex((i) => Math.max(0, Math.min(steps.length - 1, i + dir))),
    [steps.length],
  );

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

  // A visitor who signs in mid-session never keeps the automatic modal up.
  useEffect(() => {
    if (session?.user && !manual) setPhase("hidden");
  }, [session?.user, manual]);

  useEffect(() => {
    function onOpen() {
      setManual(true);
      setPicked({});
      setStepIndex(0);
      setShowAll(false);
      setSteps([...WEEKS]);
      setPhase("wizard");
    }
    window.addEventListener(OPEN_WIZARD_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_WIZARD_EVENT, onOpen);
  }, []);

  // Mobile swipe: left/right across the wizard panel moves to next/previous week.
  useEffect(() => {
    if (phase !== "wizard" || !panelRef.current) return;
    const panel = panelRef.current;
    const state = { startX: 0, startY: 0, active: false };

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      state.startX = t.clientX;
      state.startY = t.clientY;
      state.active = true;
    };

    const onMove = (e: TouchEvent) => {
      if (!state.active) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - state.startX;
      const dy = t.clientY - state.startY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 20) {
        e.preventDefault();
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (!state.active) return;
      state.active = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - state.startX;
      const dy = t.clientY - state.startY;
      if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.2) {
        e.preventDefault();
        goStep(dx < 0 ? 1 : -1);
      }
    };

    const onCancel = () => {
      state.active = false;
    };

    panel.addEventListener("touchstart", onStart, { passive: true });
    panel.addEventListener("touchmove", onMove, { passive: false });
    panel.addEventListener("touchend", onEnd, { passive: false });
    panel.addEventListener("touchcancel", onCancel, { passive: true });

    return () => {
      panel.removeEventListener("touchstart", onStart);
      panel.removeEventListener("touchmove", onMove);
      panel.removeEventListener("touchend", onEnd);
      panel.removeEventListener("touchcancel", onCancel);
    };
  }, [phase, stepIndex, goStep]);



  const close = useCallback(() => {
    markDismissed();
    setManual(false);
    setPhase("hidden");
  }, []);

  const current = useMemo(() => ({ ...plan, ...picked }), [plan, picked]);
  const week = steps[stepIndex];

  const finish = useCallback(() => {
    if (manual || session?.user) close();
    else setPhase("done");
  }, [manual, session?.user, close]);

  const choose = useCallback(
    (w: number, teamId: string) => {
      setPick(w, teamId);
      setPicked((prev) => ({ ...prev, [w]: teamId }));
      setShowAll(false);
      if (stepIndex + 1 >= steps.length) finish();
      else setStepIndex((i) => i + 1);
    },
    [setPick, stepIndex, steps.length, finish],
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
    if (manual || session?.user) close();
    else setPhase("done");
  }, [current, slots, setPick, manual, session?.user, close]);

  const goAuth = useCallback(() => {
    stashWizardPlan(current);
    markDismissed();
    setPhase("hidden");
    void navigate({ to: "/auth" });
  }, [current, navigate]);

  if (phase === "hidden" || pathname.startsWith("/auth")) return null;

  const options = week ? eligibleTeams(slots, current, week) : [];
  const top5 = options.slice(0, 5);
  const oppLabel = (s: { opponentId: string | null; isHome: boolean }) => {
    const opp = s.opponentId ? teamsById.get(s.opponentId) : null;
    const abbr = opp?.abbr ?? opp?.name ?? "—";
    return `${s.isHome ? "vs" : "@"} ${abbr}`;
  };


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
            <button
              className="btn primary"
              onClick={() => {
                setSteps(WEEKS.filter((w) => !plan[w]));
                setStepIndex(0);
                setPhase("wizard");
              }}
            >
              Get started
            </button>
            <Link to="/auth" className="welcome-link" onClick={markDismissed}>
              Log in / create account
            </Link>
          </div>
        </div>
      ) : null}

      {phase === "wizard" && week ? (
        <div ref={panelRef} className="welcome-panel welcome-fade" key={week}>

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
                  <span className="welcome-pick-name">
                    {t?.name ?? t?.abbr ?? s.teamId}
                    <span className="welcome-pick-opp">{oppLabel(s)}</span>
                  </span>
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
            {steps.map((w, i) => (
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
