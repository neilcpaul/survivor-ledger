import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Empty } from "@/components/bits";
import { NewsCard, NewsDialog } from "@/components/news";
import { TeamDetailStack } from "@/components/TeamDetail";
import { articleTeamIds, fetchNews, type Article } from "@/lib/news";
import { useSurvivor } from "@/lib/survivor-store";
import { WEEKS } from "@/lib/survivor";

export const Route = createFileRoute("/teams/$teamId")({
  head: () => ({
    meta: [
      { title: "Team — Survivor Ledger" },
      {
        name: "description",
        content:
          "NFL team page: schedule strength, related news, full roster and current injury status for Survivor pool planning.",
      },
      { property: "og:title", content: "Team — Survivor Ledger" },
      {
        property: "og:description",
        content: "Related news, roster and current injury status for this NFL team.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TeamPage,
});

function TeamPage() {
  const { teamId } = Route.useParams();
  const { teamsById, slots, loading } = useSurvivor();
  const team = teamsById.get(teamId);
  const [open, setOpen] = useState<Article | null>(null);

  const { data: news } = useQuery({
    queryKey: ["news", 50],
    queryFn: () => fetchNews(50),
    staleTime: 60_000,
  });

  const related = useMemo(
    () => (news ?? []).filter((a) => articleTeamIds(a).includes(teamId)).slice(0, 8),
    [news, teamId],
  );

  const games = useMemo(
    () => WEEKS.map((w) => slots.get(w)?.get(teamId)).filter(Boolean),
    [slots, teamId],
  );

  if (loading) {
    return (
      <AppShell title="Team">
        <Empty>Loading team…</Empty>
      </AppShell>
    );
  }

  if (!team) {
    return (
      <AppShell title="Team">
        <Empty>
          Unknown team. <Link to="/inventory">Back to Team Inventory</Link>
        </Empty>
      </AppShell>
    );
  }

  return (
    <AppShell title={team.name ?? team.abbr ?? "Team"}>
      <section className="card team-header" style={{ marginBottom: 16 }}>
        {team.logo_url ? (
          <img src={team.logo_url} alt="" width={56} height={56} className="team-header-logo" />
        ) : null}
        <div className="min-w-0">
          <h2>{team.name ?? team.abbr}</h2>
          <p className="sub">
            {[team.conference, team.division].filter(Boolean).join(" · ") || "NFL"} ·{" "}
            {games.length} scheduled games this season
          </p>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <div>
            <h2>Related news</h2>
            <p className="sub">ESPN stories tagged to {team.abbr ?? team.name}.</p>
          </div>
          <Link to="/news" className="btn">
            All news →
          </Link>
        </div>
        {related.length === 0 ? (
          <Empty>No recent stories tagged to this team.</Empty>
        ) : (
          <div className="news-grid">
            {related.map((a) => (
              <NewsCard key={a.id} article={a} onOpen={() => setOpen(a)} />
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Roster and injuries</h2>
            <p className="sub">Injury data reflects current status, not a past week.</p>
          </div>
        </div>
        <TeamDetailStack teamIds={[teamId]} />
      </section>

      {open ? <NewsDialog article={open} onClose={() => setOpen(null)} /> : null}
    </AppShell>
  );
}
