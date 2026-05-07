import { Link } from "wouter";
import { Layout } from "@/components/Layout";
import { HeroMediaSection } from "@/components/HeroMediaSection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useGetUserHistory } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Star,
  Loader2,
  Calendar,
  ArrowUpRight,
  BookMarked,
  Footprints,
  Ruler,
  Flame,
  Mountain,
  MapPin,
} from "lucide-react";
import type { HistoryEntry } from "@workspace/api-client-react";

const HERO_IMAGE = `${import.meta.env.BASE_URL}images/history.webp`;
const FALLBACK_THUMB = `${import.meta.env.BASE_URL}images/trail-card.jpg`;

type HistoryEntryWithImage = HistoryEntry & { imageUrl?: string | null };
type HistoryEntryWithExtras = HistoryEntryWithImage & { startPoint?: string | null };

function resolveTrailImageUrl(imageUrl?: string | null) {
  const base = import.meta.env.BASE_URL || "/";
  const raw = (imageUrl ?? "").trim();

  if (!raw) return FALLBACK_THUMB;

  // Some older imports may have stored a JSON blob like {"url":"https://..."}
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as { url?: string };
      if (parsed?.url) return resolveTrailImageUrl(parsed.url);
    } catch {
      // ignore
    }
  }

  // Absolute URLs (or data URLs) are used as-is.
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("data:")) {
    // Hotlink protection can break <img> loads; proxy through our API.
    return `${base}api/media/proxy?url=${encodeURIComponent(raw)}`;
  }

  // Root-relative paths are used as-is.
  if (raw.startsWith("/")) return raw;

  // Otherwise treat as a path relative to the app base.
  return `${base}${raw.replace(/^\.?\//, "")}`;
}

function RatingStars({ rating }: { rating: number | null | undefined }) {
  if (rating == null) return null;
  const filled = Math.min(5, Math.max(0, Math.round(rating)));
  return (
    <div className="flex items-center gap-0.5" aria-label={`${filled} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn(
            "h-3 w-3",
            i < filled ? "fill-amber-400 text-amber-400" : "fill-transparent text-white/70"
          )}
        />
      ))}
    </div>
  );
}

function hikerTier(completed: number) {
  if (completed >= 10) return { label: "Seasoned explorer", hint: "10+ hikes logged" };
  if (completed >= 5) return { label: "Active trailblazer", hint: "5+ hikes logged" };
  return { label: "Weekend wanderer", hint: "Just getting started" };
}

function difficultyChip(d: string) {
  switch (d.toLowerCase()) {
    case "easy":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100";
    case "moderate":
      return "border-amber-500/25 bg-amber-500/10 text-amber-950 dark:text-amber-100";
    case "hard":
      return "border-orange-500/30 bg-orange-500/10 text-orange-950 dark:text-orange-100";
    case "expert":
      return "border-rose-500/30 bg-rose-500/10 text-rose-950 dark:text-rose-100";
    default:
      return "border-border bg-muted/50 text-foreground";
  }
}

function groupByMonth(entries: HistoryEntryWithExtras[]) {
  const map = new Map<string, HistoryEntryWithImage[]>();
  for (const e of entries) {
    const key = format(new Date(e.completedAt), "MMMM yyyy");
    const arr = map.get(key);
    if (arr) arr.push(e);
    else map.set(key, [e]);
  }
  return Array.from(map.entries());
}

function EntryCard({ entry, index }: { entry: HistoryEntryWithExtras; index: number }) {
  const d = new Date(entry.completedAt);
  const thumb = resolveTrailImageUrl(entry.imageUrl);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.32 }}
    >
      <Link href={`/trails/${entry.trailId}`} className="group block outline-none">
        <article
          className={cn(
            "relative overflow-hidden rounded-2xl border border-border/60 bg-background/70 p-5 shadow-sm transition-all",
            "hover:-translate-y-0.5 hover:border-primary/30 hover:bg-background/85 hover:shadow-[0_22px_60px_-26px_rgba(0,0,0,0.22)]",
            "focus-visible:ring-2 focus-visible:ring-primary/30",
            "dark:bg-background/60 dark:hover:shadow-black/40"
          )}
        >
          <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100 bg-gradient-to-br from-primary/[0.08] via-transparent to-transparent" />

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-stretch sm:justify-between">
            <div className="min-w-0 space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <time
                  dateTime={entry.completedAt}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/20 px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground"
                >
                  <Calendar className="h-3.5 w-3.5 opacity-70" />
                  {format(d, "MMM d")}
                </time>
                <Badge variant="outline" className={cn("capitalize font-medium", difficultyChip(entry.difficulty))}>
                  {entry.difficulty}
                </Badge>
                <Badge variant="outline" className="capitalize font-normal text-muted-foreground">
                  {entry.terrain}
                </Badge>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Ruler className="h-3.5 w-3.5" />
                  {entry.lengthKm} km
                </span>
              </div>

              <h3 className="font-display text-xl font-semibold tracking-tight text-foreground group-hover:text-primary transition-colors md:text-2xl">
                {entry.trailName}
              </h3>

              {entry.startPoint ? (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4 opacity-70" />
                  <span className="truncate">{entry.startPoint}</span>
                </p>
              ) : null}

              {entry.notes ? (
                <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                  <span className="text-primary/70">&ldquo;</span>
                  {entry.notes}
                  <span className="text-primary/70">&rdquo;</span>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">No notes for this hike.</p>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-between gap-4 sm:flex-col sm:items-end sm:justify-between">
              <div className="relative h-24 w-full overflow-hidden rounded-2xl border border-border/60 bg-muted/20 shadow-sm sm:h-28 sm:w-56 md:w-64">
                <img
                  src={thumb}
                  alt={entry.trailName}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  loading="lazy"
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (img.src !== FALLBACK_THUMB) img.src = FALLBACK_THUMB;
                  }}
                />
                <div
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/22 via-black/0 to-transparent transition-opacity duration-700 group-hover:opacity-95"
                  aria-hidden
                />

                {entry.rating != null && (
                  <div className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-full bg-black/22 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm ring-1 ring-white/12 backdrop-blur-md">
                    <RatingStars rating={entry.rating} />
                    <span className="tabular-nums opacity-90">{Math.round(Number(entry.rating))}/5</span>
                  </div>
                )}

                <div className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-foreground shadow-sm ring-1 ring-white/18 backdrop-blur-md">
                  View trail <ArrowUpRight className="h-3.5 w-3.5" />
                </div>
              </div>
            </div>
          </div>
        </article>
      </Link>
    </motion.div>
  );
}

export function History() {
  const { user } = useAuth();
  const userId = user?.id ?? "";

  const { data, isLoading } = useGetUserHistory(userId);

  const completed = data?.totalCompleted ?? 0;
  const tier = hikerTier(completed);
  const totalKm = data?.totalKm ?? 0;
  const entries: HistoryEntryWithExtras[] = (data?.history as HistoryEntryWithExtras[] | undefined) ?? [];
  const grouped = entries.length ? groupByMonth(entries) : [];

  return (
    <Layout>
      <HeroMediaSection imageSrc={HERO_IMAGE} imageAlt="" minHeightClass="min-h-[32vh] lg:min-h-[38vh] pb-14 lg:pb-16">
        <div className="relative z-10 mx-auto max-w-2xl px-4 pt-28 pb-4 text-center sm:pt-32">
          <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-white shadow-lg backdrop-blur-md">
            <BookMarked className="h-7 w-7" strokeWidth={1.5} />
          </div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.32em] text-white/75">Journal</p>
          <h1 className="font-display text-4xl font-bold tracking-tight text-white drop-shadow-[0_2px_18px_rgba(0,0,0,0.5)] sm:text-5xl">
            Your hikes
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-white/90 drop-shadow-sm sm:text-base">
            {user?.firstName ? `Your completed routes, ${user.firstName}.` : "Your completed routes, saved as a clean log."}
          </p>
        </div>
      </HeroMediaSection>

      <div className="relative z-20 -mt-16 pb-24 lg:-mt-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div
            className={cn(
              "rounded-[1.75rem] border border-border/50 bg-background/80 p-6 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.12)] backdrop-blur-2xl",
              "dark:border-border/40 dark:bg-background/75 dark:shadow-black/30",
              "md:p-9 lg:p-10"
            )}
          >
            <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 text-primary">
                  <Footprints className="h-5 w-5" strokeWidth={1.5} />
                  <span className="text-xs font-semibold uppercase tracking-[0.2em]">My log</span>
                </div>
                <h2 className="font-display text-2xl font-semibold text-foreground md:text-3xl">Completed hikes</h2>
                <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
                  A calm, month-by-month record of your adventures.
                </p>
              </div>
              <div className="flex flex-col items-start gap-2 sm:items-end">
                {!isLoading && data ? (
                  <p className="text-sm tabular-nums text-muted-foreground">
                    <span className="font-semibold text-foreground">{data.history.length}</span> entries
                  </p>
                ) : null}
                <Button variant="outline" size="sm" className="rounded-xl" asChild>
                  <Link href="/">Browse trails</Link>
                </Button>
              </div>
            </div>

            {/* Stats */}
            {isLoading ? (
              <div className="flex min-h-[140px] items-center justify-center gap-3 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-sm">Loading your journal…</span>
              </div>
            ) : (
              <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-2xl border border-border/60 bg-gradient-to-b from-muted/25 to-transparent p-5 dark:from-muted/10">
                  <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/15">
                    <Mountain className="h-5 w-5" strokeWidth={1.6} />
                  </div>
                  <p className="font-display text-3xl font-bold tabular-nums tracking-tight text-foreground">{completed}</p>
                  <p className="mt-1 text-sm font-medium text-muted-foreground">Trails completed</p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-gradient-to-b from-muted/25 to-transparent p-5 dark:from-muted/10">
                  <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
                    <Ruler className="h-5 w-5" strokeWidth={1.6} />
                  </div>
                  <p className="font-display text-3xl font-bold tabular-nums tracking-tight text-foreground">
                    {totalKm.toFixed(1)}
                  </p>
                  <p className="mt-1 text-sm font-medium text-muted-foreground">Total km hiked</p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-gradient-to-b from-muted/25 to-transparent p-5 dark:from-muted/10">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 ring-1 ring-rose-500/15">
                      <Flame className="h-5 w-5" strokeWidth={1.6} />
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</span>
                  </div>
                  <p className="font-display text-xl font-semibold text-foreground">{tier.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{tier.hint}</p>
                </div>
              </div>
            )}

            {/* Entries */}
            {isLoading ? null : !data || data.history.length === 0 ? (
              <div className="flex flex-col items-center rounded-2xl border border-border/60 bg-muted/10 px-8 py-20 text-center dark:bg-muted/5">
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary ring-8 ring-primary/5">
                  <Mountain className="h-9 w-9 opacity-90" strokeWidth={1.25} />
                </div>
                <h3 className="font-display text-xl font-semibold text-foreground md:text-2xl">No hikes logged yet</h3>
                <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground leading-relaxed">
                  Open any trail and use <span className="font-medium text-foreground">&ldquo;Log this hike&rdquo;</span> to
                  start your journal.
                </p>
              </div>
            ) : (
              <div className="space-y-10">
                {grouped.map(([month, entries]) => (
                  <section key={month} className="space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                        {month}
                      </h3>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {entries.length} {entries.length === 1 ? "hike" : "hikes"}
                      </span>
                    </div>
                    <div className="grid gap-4">
                      {entries.map((entry, idx) => (
                        <EntryCard key={entry.id} entry={entry} index={idx} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
