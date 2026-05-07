import { useState } from "react";
import { useRoute } from "wouter";
import { Layout } from "@/components/Layout";
import { HeroMediaSection } from "@/components/HeroMediaSection";
import { DifficultyMeter } from "@/components/DifficultyMeter";
import { LogHikeDialog } from "@/components/LogHikeDialog";
import { useGetTrail } from "@workspace/api-client-react";
import { MapPin, Route, Mountain, Clock, Star, Users, ArrowLeft, Plus } from "lucide-react";
import { formatDistance, formatElevation, formatDuration } from "@/lib/utils";

export function TrailDetail() {
  const [, params] = useRoute("/trails/:id");
  const trailId = parseInt(params?.id || "0");
  
  const { data: trail, isLoading, error } = useGetTrail(trailId);
  const [isLogDialogOpen, setIsLogDialogOpen] = useState(false);

  if (isLoading) {
    return (
      <Layout>
        <section className="relative min-h-[42vh] bg-neutral-950">
          <div
            className="absolute left-0 right-0 -top-24 bottom-0 bg-neutral-800 animate-pulse"
            aria-hidden
          />
          <div className="relative z-10 flex min-h-[38vh] items-center justify-center px-4 pt-28">
            <div className="flex flex-col items-center">
              <div className="h-12 w-12 rounded-full bg-white/10" />
              <div className="mt-4 h-5 w-44 rounded bg-white/10" />
            </div>
          </div>
        </section>
      </Layout>
    );
  }

  if (error || !trail) {
    return (
      <Layout>
        <section className="relative min-h-[85vh] bg-neutral-950 text-neutral-100">
          <div className="absolute left-0 right-0 -top-24 bottom-0 bg-neutral-950" aria-hidden />
          <div className="relative z-10 mx-auto max-w-3xl px-4 pt-32 text-center">
            <h2 className="text-2xl font-bold text-red-300">Trail not found</h2>
            <button
              type="button"
              onClick={() => window.history.back()}
              className="mt-6 rounded-xl bg-white/10 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/20"
            >
              Go back
            </button>
          </div>
        </section>
      </Layout>
    );
  }

  const fallbackHeaderImage = `${import.meta.env.BASE_URL}images/landing.webp`;
  const imageUrl = trail.imageUrl || fallbackHeaderImage;

  return (
    <Layout>
      <div className="relative">
        <HeroMediaSection
          imageSrc={imageUrl}
          imageAlt={trail.name}
          minHeightClass="min-h-[42vh] md:min-h-[48vh] lg:min-h-[54vh]"
        >
          <button
            type="button"
            onClick={() => window.history.back()}
            className="absolute left-4 top-28 z-20 rounded-full border border-white/25 bg-white/20 p-3 text-white backdrop-blur-md transition-colors hover:bg-white/35 md:left-8"
            aria-label="Go back"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
        </HeroMediaSection>

        <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 -mt-32 pb-24">
          <div className="bg-white rounded-3xl shadow-2xl border border-border p-6 md:p-10">
            {/* Top Bar: Title & Primary Action */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8 border-b border-border pb-8">
              <div>
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-bold tracking-wide">
                    {trail.region}
                  </span>
                  <div className="flex items-center text-amber-500 font-bold bg-amber-50 px-2 py-1 rounded-md text-sm">
                    <Star className="w-4 h-4 mr-1 fill-amber-400" />
                    {trail.rating.toFixed(1)} <span className="text-muted-foreground ml-1 font-normal">({trail.reviewCount})</span>
                  </div>
                </div>
                <h1 className="text-3xl md:text-5xl font-display font-extrabold text-foreground mb-3 leading-tight">
                  {trail.name}
                </h1>
                <div className="flex items-center text-muted-foreground font-medium">
                  <MapPin className="w-5 h-5 mr-1 text-primary" />
                  {trail.location} • Start: {trail.startPoint}
                </div>
              </div>

              <div className="flex-shrink-0">
                <button
                  onClick={() => setIsLogDialogOpen(true)}
                  className="w-full md:w-auto px-8 py-4 bg-primary text-primary-foreground font-bold rounded-2xl shadow-lg shadow-primary/30 hover:shadow-xl hover:-translate-y-1 transition-all flex items-center justify-center gap-2 text-lg"
                >
                  <Plus className="w-6 h-6" />
                  Log This Hike
                </button>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
              <div className="bg-secondary/30 p-5 rounded-2xl flex flex-col items-center text-center">
                <Route className="w-8 h-8 text-primary mb-2" />
                <span className="text-sm text-muted-foreground font-semibold uppercase tracking-wider mb-1">Distance</span>
                <span className="text-xl font-bold text-foreground">{formatDistance(trail.lengthKm)}</span>
              </div>
              <div className="bg-secondary/30 p-5 rounded-2xl flex flex-col items-center text-center">
                <Mountain className="w-8 h-8 text-primary mb-2" />
                <span className="text-sm text-muted-foreground font-semibold uppercase tracking-wider mb-1">Ascent</span>
                <span className="text-xl font-bold text-foreground">{formatElevation(trail.elevationGainM)}</span>
              </div>
              <div className="bg-secondary/30 p-5 rounded-2xl flex flex-col items-center text-center">
                <Clock className="w-8 h-8 text-primary mb-2" />
                <span className="text-sm text-muted-foreground font-semibold uppercase tracking-wider mb-1">Est. Time</span>
                <span className="text-xl font-bold text-foreground">{formatDuration(trail.estimatedDurationHours)}</span>
              </div>
              <div className="bg-secondary/30 p-5 rounded-2xl flex flex-col items-center text-center">
                <Users className="w-8 h-8 text-primary mb-2" />
                <span className="text-sm text-muted-foreground font-semibold uppercase tracking-wider mb-1">Difficulty</span>
                <div className="mt-1">
                  <DifficultyMeter difficulty={trail.difficulty} showLabel />
                </div>
              </div>
            </div>

            {/* Main Details */}
            <div className="grid md:grid-cols-3 gap-12">
              <div className="md:col-span-2 prose prose-lg max-w-none text-foreground/80">
                <h3 className="text-2xl font-display font-bold text-foreground mb-4">About this trail</h3>
                <p className="whitespace-pre-line leading-relaxed">{trail.description}</p>
                
                <h3 className="text-2xl font-display font-bold text-foreground mt-8 mb-4">Highlights</h3>
                <p className="whitespace-pre-line leading-relaxed">{trail.highlights}</p>
              </div>

              <div className="space-y-8">
                <div className="bg-secondary/50 p-6 rounded-2xl border border-border">
                  <h3 className="text-lg font-bold font-display mb-4">Trail Characteristics</h3>
                  <div className="space-y-4">
                    <div>
                      <span className="text-sm text-muted-foreground block mb-1">Terrain</span>
                      <span className="font-semibold capitalize bg-white px-3 py-1 rounded-lg border border-border inline-block">
                        {trail.terrain}
                      </span>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground block mb-1">Scenery</span>
                      <span className="font-semibold capitalize bg-white px-3 py-1 rounded-lg border border-border inline-block">
                        {trail.scenery}
                      </span>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground block mb-2">Tags</span>
                      <div className="flex flex-wrap gap-2">
                        {trail.tags.map(tag => (
                          <span key={tag} className="bg-primary/5 text-primary text-xs font-bold px-2.5 py-1 rounded-md">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      <LogHikeDialog 
        trailId={trail.id} 
        trailName={trail.name}
        isOpen={isLogDialogOpen} 
        onClose={() => setIsLogDialogOpen(false)} 
      />
    </Layout>
  );
}
