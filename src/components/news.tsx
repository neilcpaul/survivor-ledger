import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useSurvivor } from "@/lib/survivor-store";
import { articleTeamIds, relativeTime, type Article } from "@/lib/news";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function TeamBadge({ teamId }: { teamId: string }) {
  const { teamsById } = useSurvivor();
  const team = teamsById.get(teamId);
  if (!team) return null;
  return (
    <Link
      to="/teams/$teamId"
      params={{ teamId }}
      className="news-team-badge"
      onClick={(e) => e.stopPropagation()}
      title={team.name ?? team.abbr ?? "Team page"}
    >
      {team.logo_url ? (
        <img src={team.logo_url} alt="" width={16} height={16} loading="lazy" />
      ) : null}
      <span className="num">{team.abbr ?? team.name}</span>
    </Link>
  );
}

export function NewsDialog({ article, onClose }: { article: Article; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const teamIds = articleTeamIds(article);

  return (
    <div
      className="drawer-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="fixture-dialog" role="dialog" aria-modal="true" aria-labelledby="news-title">
        <div className="drawer-head">
          <div className="min-w-0">
            <h3 id="news-title" className="truncate-2">
              {article.headline ?? "Story"}
            </h3>
            <div className="sub">
              {relativeTime(article.published_at)}
              {article.byline ? ` · ${article.byline}` : ""}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close story">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="drawer-body">
          {article.image_url ? (
            <figure className="news-figure">
              <img src={article.image_url} alt={article.image_caption ?? ""} loading="lazy" />
              {article.image_caption ? (
                <figcaption className="sub">{article.image_caption}</figcaption>
              ) : null}
            </figure>
          ) : null}
          {article.description ? <p className="news-teaser">{article.description}</p> : null}
          {teamIds.length ? (
            <div className="news-badges" style={{ marginTop: 12 }}>
              {teamIds.map((id) => (
                <TeamBadge key={id} teamId={id} />
              ))}
            </div>
          ) : null}
          {article.article_url ? (
            <p style={{ marginTop: 14 }}>
              <a
                className="btn primary"
                href={article.article_url}
                target="_blank"
                rel="noreferrer noopener"
              >
                Read full story on ESPN ↗
              </a>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function NewsTicker({ articles }: { articles: Article[] }) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState<Article | null>(null);
  const paused = useRef(false);

  const items = useMemo(() => articles.slice(0, 8), [articles]);

  useEffect(() => {
    if (items.length <= 1) return;
    const t = setInterval(() => {
      if (!paused.current) setIndex((i) => (i + 1) % items.length);
    }, 6000);
    return () => clearInterval(t);
  }, [items.length]);

  if (!items.length) return null;
  const current = items[Math.min(index, items.length - 1)]!;
  const teamIds = articleTeamIds(current);

  return (
    <section
      className="card news-ticker"
      aria-label="Latest NFL news"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
    >
      <div className="news-ticker-row">
        <button
          className="icon-btn"
          aria-label="Previous headline"
          onClick={() => setIndex((i) => (i - 1 + items.length) % items.length)}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>

        <button className="news-ticker-item" onClick={() => setOpen(current)}>
          {index === 0 ? <span className="pill scenario">Top story</span> : null}
          {teamIds[0] ? <TeamBadge teamId={teamIds[0]} /> : null}
          <span className="news-headline truncate">{current.headline ?? "Story"}</span>
          <span className="sub num">{relativeTime(current.published_at)}</span>
        </button>

        <button
          className="icon-btn"
          aria-label="Next headline"
          onClick={() => setIndex((i) => (i + 1) % items.length)}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>

        <Link to="/news" className="btn">
          All news →
        </Link>
      </div>

      <div className="news-dots" role="tablist" aria-label="Headlines">
        {items.map((a, i) => (
          <button
            key={a.id}
            role="tab"
            aria-selected={i === index}
            aria-label={`Headline ${i + 1}`}
            className={`news-dot${i === index ? " active" : ""}`}
            onClick={() => setIndex(i)}
          />
        ))}
      </div>

      {open ? <NewsDialog article={open} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}

export function NewsCard({ article, onOpen }: { article: Article; onOpen: () => void }) {
  const teamIds = articleTeamIds(article);
  return (
    <article className="news-card" onClick={onOpen}>
      {article.image_url ? (
        <img className="news-card-img" src={article.image_url} alt="" loading="lazy" />
      ) : null}
      <div className="news-card-body">
        <h3 className="news-headline">{article.headline ?? "Story"}</h3>
        {article.description ? <p className="sub truncate-3">{article.description}</p> : null}
        <div className="news-badges">
          <span className="sub num">{relativeTime(article.published_at)}</span>
          {teamIds.map((id) => (
            <TeamBadge key={id} teamId={id} />
          ))}
        </div>
      </div>
    </article>
  );
}
