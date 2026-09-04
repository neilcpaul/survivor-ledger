# Survivor Ledger

Build Survivor Ledger, a forecast dashboard for an NFL Survivor pool (pick one team to win outright each week; each team can only be used once across the season; last person standing wins). This is a planning tool, not a live scoreboard — the emphasis throughout is "what happens to my season-long odds if I change this pick," not real-time game tracking.

Stack: React + Vite + Tailwind for layout utilities, Supabase for auth/Postgres/edge functions. Do not use Tailwind's default color palette anywhere in the UI — every color comes from the custom tokens below.

Design system — retain exactly

Light and dark palettes as CSS custom properties on :root, redefined under prefers-color-scheme: dark (guarded so an explicit data-theme="light" wins) and again under [data-theme="dark"] (so a manual toggle wins in both directions):

css

:root{
  --bg:#F1F4EA; --surface:#FFFFFF; --surface-2:#E9EEE1; --border:#D6DECB;
  --ink:#182319; --ink-muted:#5B6B5B; --ink-faint:#8C9788;
  --accent:#1B8A54; --accent-ink:#0E4F30; --accent-soft:#DCEEE1;
  --optimal:#3157A0; --optimal-soft:#DEE6F3;
  --scenario:#C1541F;
  --good:#1B8A54; --good-soft:#DCEEE1;
  --caution:#B4740E; --caution-soft:#F3E7CE;
  --critical:#A23B2E; --critical-soft:#F3DCD8;
  --neutral:#8C9788; --neutral-soft:#E9EEE1;
  --seq-low:#E3EBDD; --seq-high:#14603C;
  --focus:#3157A0;
  --shadow: 0 1px 2px rgba(24,35,25,.06), 0 6px 20px rgba(24,35,25,.06);
}
/* dark: --bg:#10160E; --surface:#171F15; --surface-2:#1D261A; --border:#2B3626;
   --ink:#E9EFE3; --ink-muted:#9FAD97; --ink-faint:#6C7A65;
   --accent:#3FAE73; --accent-ink:#B7E6C8; --accent-soft:#1E3626;
   --optimal:#7398D6; --optimal-soft:#202B40; --scenario:#D9834F;
   --good:#3FAE73; --good-soft:#1E3626; --caution:#E3A83D; --caution-soft:#3A2E14;
   --critical:#D9564C; --critical-soft:#3B2320; --neutral:#7C8877; --neutral-soft:#232B20;
   --seq-low:#22301F; --seq-high:#58C98A; --focus:#7398D6;
   --shadow: 0 1px 2px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.35); */

Semantics: accent = "your plan" / brand green. optimal = the algorithmic benchmark line (blue, dashed). scenario = rust/orange, used for negative deltas and what-if bars. good/caution/critical are status colors (win-probability tiers, injury severity) — never reuse them as identity colors for a line or series. seq-low → seq-high is a single-hue sequential ramp (used for the matchup heatmap, interpolated per-cell by win probability).

Typography: three families, loaded from Google Fonts.

Big Shoulders Display (600/700/800) — condensed, uppercase, for h1/h2/h3 and hero stat numbers. Gives the page an athletic/scoreboard character instead of a generic SaaS look.

IBM Plex Sans (400/500/600) — body copy, labels, nav, buttons.

IBM Plex Mono (400/500/600) — every number: percentages, win probabilities, cumulative odds, table figures. Use font-variant-numeric: tabular-nums.

Layout: a fixed 216px left nav rail + main content area (grid-template-columns: 216px 1fr). Rail: brand mark, a vertical list of nav items (small dot indicator, filled when active), collapses to a horizontal scrolling bar under 920px. Topbar: page title (h1), a "Week N of 18 · Regular season" badge, the auth widget (see below), and a data-freshness indicator on the right ("Synced Xm ago" + a manual "Refresh" button, disabled/greyed until the 5-minute cache is actually stale).

Component patterns to reuse everywhere: white/dark surface cards with 1px border, 10px radius, and the --shadow token; stat-card grids (label in small caps muted text, big Big-Shoulders-Display number, small sub-line); status pills (colored text on a soft background of the same hue, e.g. .good = color:var(--good); background:var(--good-soft)); a .delta chip pattern for up/down changes (▲ green / ▼ rust, monospace figure).

Information architecture

Left nav, five items, in this order: Season Overview, Team Inventory, Matchup Heatmap, Pick Comparator, Fixtures. No sixth "coming soon" item.

Auth & entries (Supabase)

Supabase Auth (email or OAuth — your call) for sign-in.

Signed-out visitors can still use the entire app: pick teams, edit the season plan, see the forecast — all of it held in local component state only, never written to the database. Show a small "Not saved · local to this device" indicator wherever the plan is edited, and a "Sign in" button in the topbar.

Signed-in users get an entry selector in the topbar (a <select> of their league entries) instead of the guest badge, plus their name and a sign-out control. Selecting an entry loads that entry's saved plan from picks; editing a pick immediately upserts to picks (optimistic UI — update local state first, then write). Show "● Synced to {entry name}" once the write succeeds.

Users can create a new entry (name it, e.g. "Office Pool") from the entry selector — insert into entries scoped to auth.uid().

Tables (Postgres via Supabase):

profiles        (id uuid pk references auth.users, display_name text)
entries         (id uuid pk, user_id uuid references auth.users, name text, created_at timestamptz)
picks           (id uuid pk, entry_id uuid references entries, week int, team_id text, created_at timestamptz,
                  unique (entry_id, week))
teams           (id text pk /* espn team id */, abbr text, name text, conference text, division text, logo_url text)
games           (id text pk /* espn event id */, week int, season_type int, season_year int,
                  home_team_id text references teams, away_team_id text references teams,
                  kickoff_at timestamptz, venue_name text, venue_city text, venue_state text, venue_indoor bool,
                  broadcast text, weather_condition text, weather_temp_f int,
                  home_win_prob numeric, away_win_prob numeric, updated_at timestamptz)
injuries        (id uuid pk, team_id text references teams, athlete_id text, player_name text, position text,
                  status text /* Out | Doubtful | Questionable | IR */, detail text, updated_at timestamptz)
roster_players  (id uuid pk, team_id text references teams, athlete_id text, name text, position text,
                  jersey_number text, headshot_url text)

RLS: entries and picks are readable/writable only where user_id = auth.uid() (via the entries join for picks). teams, games, injuries, roster_players are public read-only for all clients; only the edge function (service role) writes to them.

Data layer — ESPN integration

ESPN exposes an unofficial, unauthenticated public API used by their own site. No API key, no documented rate limit — but be a good citizen: never call ESPN directly from the browser. Instead, write a Supabase Edge Function that fetches and upserts into the cache tables above, triggered on a schedule (pg_cron every 5 minutes is fine — games and odds don't move faster than that) plus an on-demand invocation from the UI's "Refresh" button (rate-limit that button client-side to once per 5-minute window). The frontend only ever reads from Supabase tables, never from ESPN directly.

Endpoints to call from the edge function (all confirmed working, unofficial/undocumented — expect occasional field changes and code defensively):

PurposeHostPathNotesScoreboard by weeksite.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week={week}&seasontype=2&dates={year}seasontype=2 = regular season only (1=pre, 3=post — never fetch those). Each events[] item has competitions[0].broadcasts[].names and .venue.fullName/address/indoor.Weather(embedded in scoreboard)events[].weather{ displayValue, temperature, highTemperature, conditionId }. Only present for some outdoor games — absent means dome or not yet available; render "—", not a broken icon.Team list (32)site.api.espn.com/apis/site/v2/sports/football/nfl/teamsSeed the teams table.Team rostersite.api.espn.com/apis/site/v2/sports/football/nfl/teams/{teamId}/rosterTeam injuriessports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/{teamId}/injuriesReflects current status only — there's no historical "injuries as of week N" snapshot in the free API, so only show this as current-state, not attributed retroactively to past fixtures.Pre-game win probabilitysports.core.api.espn.com/v2/sports/football/leagues/nfl/events/{eventId}/competitions/{eventId}/predictorhomeTeam.statistics[] / awayTeam.statistics[], field name gameProjection, 0–100 scale. Normalize to 0–1 before storing in games.home_win_prob/away_win_prob. This replaces any custom rating model — ESPN's own model output is the win-probability source of truth here.In-game win probability (optional, for completed games)sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/{eventId}/competitions/{eventId}/probabilitieshomeWinPercentage/awayWinPercentage, 0–1 scale, paginated play-by-play. Not needed for the forecast itself — skip unless you want a "how the win probability moved during the game" detail later.

Fetch order in the edge function: teams → scoreboard for weeks 1–18 (seasontype=2 only) → predictor per event → injuries/roster per team. Store updated_at on every row so the UI's freshness badge and the Fixtures page can both surface "as of" timestamps.

Core forecasting logic — unchanged from the sketch, repoint the data source

These are pure functions over games/picks data; keep them exactly as designed, just fed from Supabase instead of synthetic data:

Cumulative survival curve: running product of the picked team's win probability, week by week. Plot on a log scale (gridlines at 100% / 10% / 1% / 0.1%) — probabilities compound down fast over 18 weeks and a linear axis flattens everything past week 8.

Simulation band: ±1σ band around the curve. Either keep the closed-form variance-propagation approximation (sd ≈ cumulative × √(Σ (1-p)/p) × 0.5 across weeks so far) or upgrade to an actual N≈2000 Monte Carlo resample now that real compute is available — either is fine, the UI treatment (translucent green fill under/around the line) doesn't change.

Optimal benchmark: solve the one-team-per-season constraint as a bipartite assignment problem (weeks × teams, weight = win probability, maximize the season-long product — equivalent to minimizing -log(p) via the Hungarian/Kuhn–Munkres algorithm) over the full 18×32 matrix. Run this in an edge function (or client-side, it's cheap at this size) whenever games.home_win_prob/away_win_prob refreshes — not on every UI interaction. This is the dashed blue line and the benchmark used throughout Pick Comparator.

Eligible teams for a given week's dropdown: all teams with a game that week, minus any team already used by this entry in a different week (from picks, or from local state for guests).

Pages

Season Overview — headline stat cards (season survival probability as a percentage and as "1 in N"; delta vs. original plan; delta vs. optimal benchmark; weeks matching the benchmark). Below that, the log-scale chart: your plan (solid green), optimal benchmark (dashed blue), simulation band (translucent green fill), hover crosshair with a tooltip showing both plans' pick/opponent/win%/cumulative for that week. Below the chart, an editable 18-row plan table — one row per week, each with a <select> of eligible teams (sorted by win probability, showing opponent), a win% pill (green ≥65%, amber 50–65%, red <50%), the running cumulative probability, and a "Change" column showing the cumulative-odds delta versus the original plan at that week (this cascades — a week-4 edit should visibly shift the delta shown on weeks 5–18 too, not just week 4). A small dot marks whichever row was actually edited. Header of that table shows "N weeks changed · ▲/▼ X.XXpp season survival" and a "Reset to original plan" button.

Team Inventory — a grid of all 32 team chips: planned teams show which week they're assigned to and a tier-colored win% pill; unplanned ("Open") teams show their current week's win% as a hint plus their bye week.

Matchup Heatmap — a team × week table (teams as rows, weeks as scrollable columns), each cell colored on the sequential green ramp by that team's win probability that week, bye weeks hashed out, a team's already-committed-elsewhere weeks shown faded, and its planned week ringed.

Pick Comparator — three summary cards (your plan's final odds, the optimal benchmark's final odds, and the multiple between them) plus a week-by-week table: your pick vs. the optimal pick, both win%, a match indicator, and a diverging delta bar (green = you're ahead of the benchmark that week, rust = behind) — this is the "where exactly is my plan losing to the algorithm" view.

Fixtures (new page) — the full regular-season schedule, filterable and clickable:

Filter row: Week selector (1–18), Team selector (all 32 + "All teams"), both filtering client-side against the already-loaded week's data (no round-trip needed — a week is at most 16 games).

Each fixture row: away @ home (team abbreviations/logos), kickoff time converted to the viewer's local timezone, venue name + city/state with a small indoor/outdoor icon, broadcast network, weather (icon + temp + condition for outdoor games, a "Dome" badge for indoor, "—" when ESPN hasn't published it yet), and both teams' win probability from games.home_win_prob/away_win_prob shown as two adjacent percentages or a small split bar.

Clicking a row expands it (accordion or side drawer, your call) to show both teams' current injury report — player, position, a status pill using the same severity colors as the rest of the app (Out → critical/red, Doubtful → caution/amber, Questionable → a lighter caution, Probable → good/green) — and both teams' roster, grouped by position with QB/RB/WR/TE surfaced first and the rest collapsible (rosters run ~53 players; don't dump all of them flat). Make clear in the UI that injury status reflects the current report, not a record of what it was in that specific week historically.

States & polish

Empty/loading: match the existing typographic voice (muted small-caps labels, not spinners-only) — e.g. "Loading fixtures…" in --ink-faint.

Stale/failed ESPN sync: fall back to the last successfully cached data and show a visible "Data may be stale" badge rather than a blank page.

Keep the accessibility patterns from the sketch: nav rail as a role="tablist" with aria-selected, visible focus rings using the --focus token, and every icon-only status paired with a text label (never color alone).

Responsive: rail collapses to a horizontal scroll bar under ~920px; stat card grids drop from 4 to 2 columns; wide tables (heatmap, fixtures) scroll horizontally inside their own container rather than the page scrolling sideways.

Build order

Design tokens + nav shell + topbar (including the guest/signed-in auth widget) — get the look right before wiring data.

Supabase schema + RLS + the ESPN-sync edge function, seeded and running on a schedule.

Season Overview end-to-end, including the Supabase-backed picks flow for signed-in users and local-only state for guests — this page proves the core loop.

Team Inventory, Matchup Heatmap, Pick Comparator.

Fixtures, including the injury/roster expand-on-click.


Post-Build

Verify each of the functions and pages against this draft.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/051d9d77-db79-4fb6-9882-19a2a8e69698).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
