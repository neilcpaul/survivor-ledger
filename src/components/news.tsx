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
          <span className="news-headline">{current.headline ?? "Story"}</span>
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

function TruncatedBadges({
  teamIds,
  publishedAt,
}: {
  teamIds: string[];
  publishedAt: string | null;
}) {
  const visibleRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(teamIds.length);

  useEffect(() => {
    const calc = () => {
      const visible = visibleRef.current;
      const measure = measureRef.current;
      if (!visible || !measure) return;
      if (teamIds.length === 0) {
        setVisibleCount(0);
        return;
      }
      const available = visible.clientWidth;
      const measureRect = measure.getBoundingClientRect();
      const children = Array.from(measure.children) as HTMLElement[];
      const timeWidth = children[0]?.getBoundingClientRect().width ?? 0;
      const plusEl = children[children.length - 1];
      const plusWidth = plusEl ? plusEl.getBoundingClientRect().width : 0;
      const badgeChildren = children.slice(1, -1);

      let count = 0;
      for (let i = 0; i < badgeChildren.length; i++) {
        const right =
          badgeChildren[i]!.getBoundingClientRect().right - measureRect.left;
        const needsPlus = i < badgeChildren.length - 1;
        const required = right + (needsPlus ? plusWidth : 0);
        if (required <= available) {
          count = i + 1;
        } else {
          break;
        }
      }
      setVisibleCount(count);
    };

    calc();
    const ro = new ResizeObserver(calc);
    if (visibleRef.current) ro.observe(visibleRef.current);
    if (measureRef.current) ro.observe(measureRef.current);
    return () => ro.disconnect();
  }, [teamIds, publishedAt]);

  const hidden = teamIds.slice(visibleCount);
  const visible = teamIds.slice(0, visibleCount);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="news-badges news-badges-truncate" ref={visibleRef}>
        <span className="sub num">{relativeTime(publishedAt)}</span>
        {visible.map((id) => (
          <TeamBadge key={id} teamId={id} />
        ))}
        {hidden.length > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="news-badge-overflow" tabIndex={0}>
                +{hidden.length}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="news-badge-overflow-tooltip">
              <div className="news-badges">
                {hidden.map((id) => (
                  <TeamBadge key={id} teamId={id} />
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <div
        className="news-badges news-badges-measure"
        ref={measureRef}
        aria-hidden="true"
      >
        <span className="sub num">{relativeTime(publishedAt)}</span>
        {teamIds.map((id) => (
          <TeamBadge key={id} teamId={id} />
        ))}
        <span className="news-badge-overflow">+{teamIds.length}</span>
      </div>
    </TooltipProvider>
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
        <TruncatedBadges teamIds={teamIds} publishedAt={article.published_at} />
      </div>
    </article>
  );
}
