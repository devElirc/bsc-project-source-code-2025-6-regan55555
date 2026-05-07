import { FormEvent, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Map, ArrowRight, Loader2, Mail, Lock, User } from "lucide-react";

type Tab = "signup" | "signin";

const FORM_MIN_HEIGHT = "420px";

export function LoginPage() {
  const [, navigate] = useLocation();
  const { isAuthenticated, isLoading, signIn, signUp } = useAuth();
  const [tab, setTab] = useState<Tab>("signin");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateAccount = (e: FormEvent) => {
    e.preventDefault();
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const trimmedEmail = email.trim();
    const trimmedPassword = password;

    setError(null);

    if (!trimmedFirst || !trimmedEmail) {
      setError("Please enter your first name and email.");
      return;
    }

    if (!trimmedPassword || trimmedPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (trimmedPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    signUp({
      firstName: trimmedFirst,
      lastName: trimmedLast || undefined,
      email: trimmedEmail,
      password: trimmedPassword,
    })
      .then((result) => {
        if (!result.ok) {
          setError(result.error ?? "Sign up failed");
        } else {
          toast({
            title: "Account created",
            description: "Welcome to TrailGuideUK! You’re now signed in.",
          });
          navigate("/");
        }
      })
      .finally(() => setIsSubmitting(false));
  };

  const handleSignIn = (e: FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    const trimmedPassword = password;

    setError(null);

    if (!trimmedEmail) {
      setError("Please enter your email.");
      return;
    }
    if (!trimmedPassword) {
      setError("Please enter your password.");
      return;
    }

    setIsSubmitting(true);

    signIn({ email: trimmedEmail, password: trimmedPassword })
      .then((result) => {
        if (!result.ok) {
          setError(result.error ?? "Sign in failed");
        } else {
          toast({
            title: "Signed in",
            description: "You’re now signed in to TrailGuideUK.",
          });
          navigate("/");
        }
      })
      .finally(() => setIsSubmitting(false));
  };

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate("/");
    }
  }, [isLoading, isAuthenticated, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <Loader2 className="w-10 h-10 animate-spin text-white" />
      </div>
    );
  }

  const inputBase =
    "w-full pl-11 pr-4 py-3 rounded-xl bg-slate-50/90 border border-slate-200/60 text-foreground placeholder:text-slate-400 text-[15px] outline-none transition-all duration-200 focus:bg-white focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/20";

  const inputWrapper = "relative";

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-12">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url(/images/landing.webp)" }}
      />
      <div
        className="absolute inset-0"
      />

      <div className="relative z-10 w-full max-w-[400px]">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 mb-4">
            <Map className="w-6 h-6 text-white" />
          </div>
          <h1 className="font-display text-white text-2xl font-bold tracking-tight">
            TrailGuideUK
          </h1>
          <p className="text-white/70 text-sm mt-1">
            Discover trails · Log hikes
          </p>
        </div>

        {/* Card - fixed width and min height for consistent size */}
        <div
          className="rounded-2xl bg-white/95 backdrop-blur-xl shadow-2xl border border-white/50 overflow-hidden"
          style={{ minHeight: "520px" }}
        >
          {/* Tabs */}
          <div className="flex border-b border-slate-200/80">
            <button
              type="button"
              onClick={() => {
                setTab("signin");
                setError(null);
              }}
              className={`flex-1 py-3.5 text-sm font-medium transition-colors ${
                tab === "signin"
                  ? "text-emerald-600 border-b-2 border-emerald-500 bg-white/50"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-50/50"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("signup");
                setError(null);
              }}
              className={`flex-1 py-3.5 text-sm font-medium transition-colors ${
                tab === "signup"
                  ? "text-emerald-600 border-b-2 border-emerald-500 bg-white/50"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-50/50"
              }`}
            >
              Create account
            </button>
          </div>

          <div className="p-6">
            {/* Form container - fixed min height so switching tabs doesn't resize */}
            <div style={{ minHeight: FORM_MIN_HEIGHT }} className="flex flex-col">
              {tab === "signup" ? (
                <form
                  key="signup"
                  onSubmit={handleCreateAccount}
                  className="flex flex-col gap-4 animate-in fade-in duration-200"
                >
                  <div>
                    <h2 className="text-lg font-semibold text-slate-800">
                      Create account
                    </h2>
                    <p className="text-slate-500 text-sm mt-0.5">
                      Start tracking your hikes.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className={inputWrapper}>
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className={inputBase}
                        placeholder="First name"
                        required
                      />
                    </div>
                    <div className={inputWrapper}>
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className={inputBase}
                        placeholder="Last name"
                      />
                    </div>
                  </div>

                  <div className={inputWrapper}>
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={inputBase}
                      placeholder="Email"
                      required
                    />
                  </div>

                  <div className={inputWrapper}>
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={inputBase}
                      placeholder="Password (min 8 characters)"
                      required
                    />
                  </div>

                  <div className={inputWrapper}>
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={inputBase}
                      placeholder="Confirm password"
                      required
                    />
                  </div>

                  {error && (
                    <div className="rounded-lg bg-red-50 border border-red-200/60 px-3 py-2 text-sm text-red-700">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 rounded-xl bg-emerald-600 text-white font-medium text-sm shadow-lg shadow-emerald-600/25 hover:bg-emerald-700 active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-auto"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        Create account
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <form
                  key="signin"
                  onSubmit={handleSignIn}
                  className="flex flex-col gap-4 animate-in fade-in duration-200"
                >
                  <div>
                    <h2 className="text-lg font-semibold text-slate-800">
                      Welcome back
                    </h2>
                    <p className="text-slate-500 text-sm mt-0.5">
                      Sign in to continue.
                    </p>
                  </div>

                  <div className={inputWrapper}>
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={inputBase}
                      placeholder="Email"
                      required
                    />
                  </div>

                  <div className={inputWrapper}>
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={inputBase}
                      placeholder="Password"
                      required
                    />
                  </div>

                  {error && (
                    <div className="rounded-lg bg-red-50 border border-red-200/60 px-3 py-2 text-sm text-red-700">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 rounded-xl bg-emerald-600 text-white font-medium text-sm shadow-lg shadow-emerald-600/25 hover:bg-emerald-700 active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-auto"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        Sign in
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}

              <p className="text-center text-slate-500 text-xs mt-4 pt-4 border-t border-slate-200/60">
                By continuing, you agree to our terms and privacy policy.
              </p>
            </div>
          </div>
        </div>

        <p className="text-center mt-4">
          {tab === "signin" ? (
            <button
              type="button"
              onClick={() => {
                setTab("signup");
                setError(null);
              }}
              className="text-sm text-white/80 hover:text-white transition-colors"
            >
              Don&apos;t have an account? Create one
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setTab("signin");
                setError(null);
              }}
              className="text-sm text-white/80 hover:text-white transition-colors"
            >
              Already have an account? Sign in
            </button>
          )}
        </p>
      </div>
    </div>
  );
}
