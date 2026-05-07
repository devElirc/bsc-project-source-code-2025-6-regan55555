import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { X, Star, Loader2, CheckCircle2 } from "lucide-react";
import { useAddUserHistory } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const formSchema = z.object({
  rating: z.number().min(1).max(5).optional(),
  notes: z.string().max(500).optional(),
  completedAt: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface LogHikeDialogProps {
  trailId: number;
  trailName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function LogHikeDialog({ trailId, trailName, isOpen, onClose }: LogHikeDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [success, setSuccess] = useState(false);
  const [hoverRating, setHoverRating] = useState(0);

  const { register, handleSubmit, setValue, watch } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      completedAt: new Date().toISOString().split("T")[0],
      rating: 5,
    },
  });

  const currentRating = watch("rating") || 0;

  const mutation = useAddUserHistory({
    mutation: {
      onSuccess: () => {
        setSuccess(true);
        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
        setTimeout(() => {
          onClose();
          setSuccess(false);
        }, 2200);
      },
    },
  });

  const onSubmit = (data: FormValues) => {
    if (!user?.id) return;
    mutation.mutate({
      userId: user.id,
      data: {
        trailId,
        rating: data.rating,
        notes: data.notes,
        completedAt: data.completedAt
          ? new Date(data.completedAt).toISOString()
          : undefined,
      },
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-0">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-background rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
        <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-secondary/30">
          <h2 className="font-bold text-xl">Log Hike</h2>
          <button onClick={onClose} className="p-2 hover:bg-black/5 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          <div className="p-10 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-primary/20 text-primary rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold mb-2">Hike Logged!</h3>
            <p className="text-muted-foreground">
              Great work on <span className="font-semibold">{trailName}</span>
              {user?.firstName ? `, ${user.firstName}` : ""}!
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
            {/* Logged-as banner */}
            <div className="flex items-center gap-3 bg-primary/5 border border-primary/10 rounded-xl p-3">
              {user?.profileImageUrl ? (
                <img
                  src={user.profileImageUrl}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover ring-2 ring-primary/20"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                  {user?.firstName?.[0] ?? "?"}
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Logging as</p>
                <p className="text-sm font-semibold text-foreground">
                  {user?.firstName} {user?.lastName}
                </p>
              </div>
            </div>

            <p className="text-sm font-medium text-foreground">
              Recording your journey on{" "}
              <span className="text-primary font-semibold">{trailName}</span>
            </p>

            <div>
              <label className="block text-sm font-bold mb-1.5 text-foreground">Date completed</label>
              <input
                type="date"
                {...register("completedAt")}
                className="w-full px-4 py-3 bg-secondary/30 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-2 text-foreground">Your rating</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setValue("rating", star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="p-1"
                  >
                    <Star
                      className={cn(
                        "w-8 h-8 transition-colors",
                        (hoverRating || currentRating) >= star
                          ? "fill-amber-400 text-amber-400"
                          : "fill-muted text-muted-foreground"
                      )}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold mb-1.5 text-foreground">Notes (optional)</label>
              <textarea
                {...register("notes")}
                rows={3}
                className="w-full px-4 py-3 bg-secondary/30 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-none"
                placeholder="How was the trail? Weather, difficulty, highlights?"
              />
            </div>

            <button
              type="submit"
              disabled={mutation.isPending}
              className="w-full py-3.5 bg-primary text-primary-foreground font-bold rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:transform-none flex justify-center items-center gap-2"
            >
              {mutation.isPending && <Loader2 className="w-5 h-5 animate-spin" />}
              {mutation.isPending ? "Saving..." : "Save to History"}
            </button>
            {mutation.isError && (
              <p className="text-destructive text-sm text-center">
                Failed to log hike. Please try again.
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
