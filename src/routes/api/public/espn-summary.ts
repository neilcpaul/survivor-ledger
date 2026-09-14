import { createFileRoute } from "@tanstack/react-router";

/* ESPN payloads are undocumented and change shape; treat them as loose JSON. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const SITE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";

/**
 * Trimmed game summary for an expanded fixture row. The raw ESPN payload is
 * hundreds of KB (dominated by play-by-play), so it is fetched on demand only
 * and reduced here to the handful of fields the expansion renders.
 */
async function handle(request: Request) {
  const url = new URL(request.url);
  const eventId = url.searchParams.get("event");
  if (!eventId || !/^\d+$/.test(eventId)) {
    return new Response(JSON.stringify({ error: "bad event id" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  let data: Json = null;
  try {
    const res = await fetch(`${SITE}/summary?event=${eventId}`, {
      headers: { accept: "application/json" },
    });
    if (res.ok) data = await res.json();
  } catch {
    /* fall through to an empty payload */
  }
  if (!data) {
    return new Response(JSON.stringify({ error: "unavailable" }), {
      status: 502,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  const scoring = ((data?.drives?.previous ?? []) as Json[])
    .flatMap((d: Json) => (d?.plays ?? []) as Json[])
    .filter((p: Json) => p?.scoringPlay === true)
    .map((p: Json) => ({
      text: String(p?.text ?? ""),
      period: Number(p?.period?.number ?? 0),
      clock: String(p?.clock?.displayValue ?? ""),
      homeScore: Number(p?.homeScore ?? 0),
      awayScore: Number(p?.awayScore ?? 0),
    }));

  const teamStats = ((data?.boxscore?.teams ?? []) as Json[]).map((t: Json) => ({
    teamId: t?.team?.id != null ? String(t.team.id) : null,
    abbr: t?.team?.abbreviation ?? null,
    homeAway: t?.homeAway ?? null,
    stats: ((t?.statistics ?? []) as Json[]).map((s: Json) => ({
      label: String(s?.label ?? s?.name ?? ""),
      // `value` is sometimes the string "-" even when displayValue is right.
      display: String(s?.displayValue ?? ""),
    })),
  }));

  const players = ((data?.boxscore?.players ?? []) as Json[]).map((group: Json) => ({
    teamId: group?.team?.id != null ? String(group.team.id) : null,
    abbr: group?.team?.abbreviation ?? null,
    categories: ((group?.statistics ?? []) as Json[]).map((cat: Json) => ({
      name: String(cat?.name ?? ""),
      labels: (cat?.labels ?? []).map((l: Json) => String(l)),
      athletes: ((cat?.athletes ?? []) as Json[]).map((a: Json) => ({
        name: a?.athlete?.displayName ?? null,
        position: a?.athlete?.position?.abbreviation ?? null,
        // headshot is an object here, unlike the plain string on the scoreboard
        headshot: a?.athlete?.headshot?.href ?? null,
        // stats[] align positionally with labels[] — zip by index
        stats: (a?.stats ?? []).map((s: Json) => String(s)),
      })),
    })),
  }));

  const leaders = ((data?.leaders ?? []) as Json[]).flatMap((group: Json) =>
    ((group?.leaders ?? []) as Json[]).map((cat: Json) => ({
      teamId: group?.team?.id != null ? String(group.team.id) : null,
      category: String(cat?.displayName ?? cat?.name ?? ""),
      entries: ((cat?.leaders ?? []) as Json[]).slice(0, 1).map((l: Json) => ({
        display: String(l?.displayValue ?? ""),
        name: l?.athlete?.displayName ?? null,
        position: l?.athlete?.position?.abbreviation ?? null,
        headshot:
          typeof l?.athlete?.headshot === "string"
            ? l.athlete.headshot
            : (l?.athlete?.headshot?.href ?? null),
      })),
    })),
  );

  const payload = {
    scoring,
    teamStats,
    players,
    leaders,
    attendance: data?.gameInfo?.attendance ?? null,
    officials: ((data?.gameInfo?.officials ?? []) as Json[])
      .map((o: Json) => o?.displayName)
      .filter(Boolean),
  };

  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json",
      // Public, non-personalised data; safe to cache hard.
      "cache-control": "public, max-age=120",
    },
  });
}

export const Route = createFileRoute("/api/public/espn-summary")({
  server: { handlers: { GET: ({ request }) => handle(request) } },
});
