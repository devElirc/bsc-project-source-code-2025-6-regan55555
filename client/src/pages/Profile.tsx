import { Layout } from "@/components/Layout";
import { HeroMediaSection } from "@/components/HeroMediaSection";
import { useAuth } from "@/hooks/useAuth";
import { type ReactNode, FormEvent, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  UserRound,
  Mail,
  Loader2,
  Shield,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  PenLine,
  Lock,
} from "lucide-react";

const HERO_IMAGE = `${import.meta.env.BASE_URL}images/history.webp`;

const inputClass =
  "h-11 rounded-xl border-border/70 bg-background/80 px-4 text-sm shadow-sm transition-all placeholder:text-muted-foreground/60 focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/12 dark:bg-background/50";

function SurfaceCard({
  children,
  className,
  accent = "primary",
}: {
  children: ReactNode;
  className?: string;
  accent?: "primary" | "rose";
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[1.35rem] border border-border/55",
        "bg-gradient-to-b from-card/95 via-card/80 to-card/60 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.08)] backdrop-blur-xl",
        "dark:from-card/70 dark:via-card/55 dark:to-card/40 dark:shadow-black/20",
        accent === "primary" && "ring-1 ring-primary/[0.07]",
        accent === "rose" && "ring-1 ring-rose-500/[0.08]",
        className
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full opacity-[0.12] blur-3xl",
          accent === "primary" ? "bg-primary" : "bg-rose-500"
        )}
        aria-hidden
      />
      <div className="relative">{children}</div>
    </div>
  );
}

export function Profile() {
  const { user, updateProfile, changePassword } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [bio, setBio] = useState("");

  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
    setBio(user.bio ?? "");
  }, [user]);

  const handleProfileSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setProfileMsg(null);
    setProfileSaving(true);
    const result = await updateProfile({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      bio: bio.trim() || null,
    });
    setProfileSaving(false);
    if (result.ok) {
      setProfileMsg({ ok: true, text: "Profile saved." });
    } else {
      setProfileMsg({ ok: false, text: result.error });
    }
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (newPassword !== confirmPassword) {
      setPwMsg({ ok: false, text: "New password and confirmation do not match." });
      return;
    }
    if (newPassword.length < 8) {
      setPwMsg({ ok: false, text: "New password must be at least 8 characters." });
      return;
    }
    setPwSaving(true);
    const result = await changePassword({
      currentPassword,
      newPassword,
    });
    setPwSaving(false);
    if (result.ok) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPwMsg({ ok: true, text: "Password updated." });
    } else {
      setPwMsg({ ok: false, text: result.error });
    }
  };

  if (!user) {
    return (
      <Layout>
        <div className="mx-auto max-w-lg px-4 py-24 text-center sm:py-28">
          <SurfaceCard className="p-10">
            <UserRound className="mx-auto mb-4 h-12 w-12 text-muted-foreground/60" strokeWidth={1.25} />
            <p className="font-display text-lg font-semibold text-foreground">Sign in required</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Open your account to edit profile and security settings.
            </p>
          </SurfaceCard>
        </div>
      </Layout>
    );
  }

  const hasPassword = user.hasPassword === true;
  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email || "Your account";

  return (
    <Layout>
      <HeroMediaSection
        imageSrc={HERO_IMAGE}
        imageAlt=""
        minHeightClass="min-h-[34vh] lg:min-h-[40vh] pb-16 lg:pb-20"
      >
        <div className="relative z-10 mx-auto max-w-3xl px-4 pt-28 text-center sm:pt-32 lg:pt-36">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="flex flex-col items-center"
          >
              <div className="relative mb-6">
                <div className="absolute inset-0 scale-110 rounded-3xl bg-white/15 blur-xl" aria-hidden />
                <div className="relative flex h-[5.25rem] w-[5.25rem] items-center justify-center overflow-hidden rounded-3xl border-2 border-white/35 bg-white/12 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.5)] ring-4 ring-black/10 backdrop-blur-md">
                  {user.profileImageUrl ? (
                    <img src={user.profileImageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <UserRound className="h-10 w-10 text-white/95" strokeWidth={1.2} />
                  )}
                </div>
              </div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.35em] text-white/72">
                Your account
              </p>
              <h1 className="font-display text-4xl font-bold tracking-tight text-white drop-shadow-[0_3px_24px_rgba(0,0,0,0.55)] sm:text-5xl">
                <span className="text-white">Profile</span>
                <span className="text-primary-foreground"> &amp; security</span>
              </h1>
              <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-white/92 drop-shadow-md">
                {user.firstName ? `${user.firstName}, ` : ""}
                keep your details and password current.
              </p>
              <p className="mt-3 text-sm font-medium text-white/80">{displayName}</p>
          </motion.div>
        </div>
      </HeroMediaSection>

      <div className="relative z-20 -mt-12 pb-24 lg:-mt-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-8 lg:gap-10">
            {/* Identity */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08, duration: 0.45 }}
            >
              <SurfaceCard accent="primary">
                <div className="border-b border-border/45 bg-muted/25 px-5 py-4 sm:px-6 sm:py-5 dark:bg-muted/10">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary shadow-inner">
                        <PenLine className="h-6 w-6" strokeWidth={1.5} />
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                          Identity
                        </p>
                        <h2 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                          About you
                        </h2>
                        <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
                          Name syncs to your account. Email is read-only from your sign-in provider.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleProfileSubmit} className="space-y-4 p-5 sm:p-6 sm:pt-5">
                  <div className="rounded-2xl border border-border/50 bg-background/40 p-5 dark:bg-background/25">
                    <Label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Email
                    </Label>
                    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-3.5 text-sm text-foreground/85 dark:bg-muted/15">
                      <Mail className="h-4 w-4 shrink-0 text-primary/80" />
                      <span className="truncate font-medium">{user.email ?? "—"}</span>
                    </div>
                  </div>

                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="firstName" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        First name
                      </Label>
                      <Input
                        id="firstName"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className={inputClass}
                        required
                        autoComplete="given-name"
                        placeholder="First name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Last name
                      </Label>
                      <Input
                        id="lastName"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className={inputClass}
                        autoComplete="family-name"
                        placeholder="Last name"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bio" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Bio
                    </Label>
                    <textarea
                      id="bio"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      rows={3}
                      className={cn(
                        inputClass,
                        "min-h-[5.5rem] w-full resize-none py-3 leading-relaxed"
                      )}
                      placeholder="Favourite regions, pace, or goals — optional."
                    />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Bio is stored on this device; your name updates are saved to your TrailGuide account.
                    </p>
                  </div>

                  {profileMsg ? (
                    <div
                      role="status"
                      className={cn(
                        "flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm",
                        profileMsg.ok
                          ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-900 dark:text-emerald-100"
                          : "border-destructive/25 bg-destructive/8 text-destructive"
                      )}
                    >
                      {profileMsg.ok ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                      ) : (
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      )}
                      {profileMsg.text}
                    </div>
                  ) : null}

                  <div className="flex justify-end pt-1">
                    <Button type="submit" disabled={profileSaving} size="lg" className="min-w-[10rem] rounded-xl px-8 shadow-md">
                      {profileSaving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving…
                        </>
                      ) : (
                        "Save profile"
                      )}
                    </Button>
                  </div>
                </form>
              </SurfaceCard>
            </motion.div>

            {/* Security */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.14, duration: 0.45 }}
            >
              <SurfaceCard accent="rose">
                <div className="border-b border-border/45 bg-rose-500/[0.06] px-5 py-4 sm:px-6 sm:py-5 dark:bg-rose-500/[0.04]">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-500/12 text-rose-700 dark:text-rose-300">
                      <Shield className="h-6 w-6" strokeWidth={1.5} />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                        Security
                      </p>
                      <h2 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                        Password
                      </h2>
                      <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
                        {hasPassword
                          ? "Choose a strong password — at least 8 characters."
                          : "This account uses social sign-in; password changes are not available."}
                      </p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handlePasswordSubmit} className="space-y-4 p-5 sm:p-6 sm:pt-5">
                  {!hasPassword ? (
                    <div className="flex gap-3 rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-sm text-muted-foreground dark:bg-muted/10">
                      <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground/70" />
                      <p className="leading-relaxed">
                        You&apos;re signed in without a TrailGuide password. Use your provider to manage account security.
                      </p>
                    </div>
                  ) : null}

                  <div className="space-y-5 rounded-2xl border border-border/45 bg-background/35 p-5 dark:bg-background/20">
                    <div className="space-y-2">
                      <Label htmlFor="currentPassword" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Current password
                      </Label>
                      <div className="relative">
                        <Input
                          id="currentPassword"
                          type={showCurrent ? "text" : "password"}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          className={cn(inputClass, "pr-11")}
                          disabled={!hasPassword}
                          autoComplete="current-password"
                        />
                        <button
                          type="button"
                          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
                          onClick={() => setShowCurrent((s) => !s)}
                          disabled={!hasPassword}
                          aria-label={showCurrent ? "Hide password" : "Show password"}
                        >
                          {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="newPassword" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          New password
                        </Label>
                        <div className="relative">
                          <Input
                            id="newPassword"
                            type={showNew ? "text" : "password"}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className={cn(inputClass, "pr-11")}
                            disabled={!hasPassword}
                            autoComplete="new-password"
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
                            onClick={() => setShowNew((s) => !s)}
                            disabled={!hasPassword}
                            aria-label={showNew ? "Hide password" : "Show password"}
                          >
                            {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirmPassword" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Confirm new password
                        </Label>
                        <div className="relative">
                          <Input
                            id="confirmPassword"
                            type={showConfirm ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className={cn(inputClass, "pr-11")}
                            disabled={!hasPassword}
                            autoComplete="new-password"
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
                            onClick={() => setShowConfirm((s) => !s)}
                            disabled={!hasPassword}
                            aria-label={showConfirm ? "Hide password" : "Show password"}
                          >
                            {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {pwMsg ? (
                    <div
                      role="status"
                      className={cn(
                        "flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm",
                        pwMsg.ok
                          ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-900 dark:text-emerald-100"
                          : "border-destructive/25 bg-destructive/8 text-destructive"
                      )}
                    >
                      {pwMsg.ok ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                      ) : (
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      )}
                      {pwMsg.text}
                    </div>
                  ) : null}

                  <div className="flex justify-end pt-1">
                    <Button
                      type="submit"
                      variant="secondary"
                      size="lg"
                      disabled={!hasPassword || pwSaving}
                      className="min-w-[10rem] rounded-xl border-border/80 px-8 shadow-sm"
                    >
                      {pwSaving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Updating…
                        </>
                      ) : (
                        "Update password"
                      )}
                    </Button>
                  </div>
                </form>
              </SurfaceCard>
            </motion.div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
