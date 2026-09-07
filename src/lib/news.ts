import { supabase } from "@/integrations/supabase/client";

export type Article = {
  id: string;
  headline: string | null;
  description: string | null;
  published_at: string | null;
  byline: string | null;
  image_url: string | null;
  image_caption: string | null;
  article_url: string | null;
  team_ids: number[] | null;
};

const COLUMNS =
  "id, headline, description, published_at, byline, image_url, image_caption, article_url, team_ids";

export async function fetchNews(limit = 20): Promise<Article[]> {
  const { data, error } = await supabase
    .from("news_articles")
    .select(COLUMNS)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Article[];
}

export function articleTeamIds(a: Article): string[] {
  return (a.team_ids ?? []).map((n) => String(n));
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days < 7 ? `${days}d ago` : new Date(iso).toLocaleDateString();
}
