import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Empty } from "@/components/bits";
import { NewsCard, NewsDialog } from "@/components/news";
import { articleTeamIds, fetchNews, type Article } from "@/lib/news";
import { useSurvivor } from "@/lib/survivor-store";

export const Route = createFileRoute("/news")({
  head: () => ({
    meta: [
      { title: "NFL News — Survivor Ledger" },
      {
        name: "description",
        content:
          "The latest NFL headlines from ESPN, filterable by team, alongside your Survivor pool planning tools.",
      },
      { property: "og:title", content: "NFL News — Survivor Ledger" },
      {
        property: "og:description",
        content: "Latest NFL headlines, filterable by team, for Survivor pool planning.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NewsPage,
});

function NewsPage() {
  const { teams } = useSurvivor();
  const [limit, setLimit] = useState(12);
  const [teamFilter, setTeamFilter] = useState("");
  const [open, setOpen] = useState<Article | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["news", limit],
    queryFn: () => fetchNews(limit),
    staleTime: 60_000,
  });

  const list = useMemo(
    () =>
      (data ?? []).filter((a) => !teamFilter || articleTeamIds(a).includes(teamFilter)),
    [data, teamFilter],
  );

  return (
    <AppShell title="News">
      <section className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <div>
            <h2>Latest headlines</h2>
            <p className="sub">Newest first, straight from ESPN's NFL feed.</p>
          </div>
          <select
            className="control"
            aria-label="Filter news by team"
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
          >
            <option value="">All teams</option>
            {[...teams]
              .sort((a, b) => (a.name ?? a.abbr ?? "").localeCompare(b.name ?? b.abbr ?? ""))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name ?? t.abbr}
                </option>
              ))}
          </select>
        </div>

        {isLoading ? (
          <Empty>Loading news…</Empty>
        ) : list.length === 0 ? (
          <Empty>No stories for this team yet.</Empty>
        ) : (
          <div className="news-grid">
            {list.map((a) => (
              <NewsCard key={a.id} article={a} onOpen={() => setOpen(a)} />
            ))}
          </div>
        )}

        {(data?.length ?? 0) >= limit ? (
          <div style={{ marginTop: 14 }}>
            <button className="btn" onClick={() => setLimit((l) => l + 12)}>
              Load more
            </button>
          </div>
        ) : null}
      </section>

      {open ? <NewsDialog article={open} onClose={() => setOpen(null)} /> : null}
    </AppShell>
  );
}
