import {
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
  ReactNode,
} from "react";
import type { AuthUser as BackendAuthUser } from "@workspace/api-client-react";

export type AuthUser = BackendAuthUser & {
  bio?: string | null;
  /** Present after /api/auth/user; true for email/password accounts */
  hasPassword?: boolean;
};

export interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signUp: (data: {
    firstName: string;
    lastName?: string;
    email: string;
    password: string;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  signIn: (data: {
    email: string;
    password: string;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => Promise<void>;
  login: () => void;
  updateProfile: (updates: {
    firstName: string;
    lastName: string;
    bio?: string | null;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  changePassword: (data: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
}

const PROFILE_STORAGE_KEY = "trail_guideUK_profile_overrides";

type ProfileOverride = { bio?: string | null };

function loadProfileOverrides(): Record<string, ProfileOverride> {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, ProfileOverride>;
    }
  } catch {
    localStorage.removeItem(PROFILE_STORAGE_KEY);
  }
  return {};
}

function saveProfileOverrides(overrides: Record<string, ProfileOverride>) {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // ignore write failures
  }
}

const AuthContext = createContext<AuthState | undefined>(undefined);

type AuthUserPayload = {
  user: BackendAuthUser | null;
  account?: { hasPassword?: boolean };
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/user", { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<AuthUserPayload>;
      })
      .then((data) => {
        if (cancelled) return;
        if (!data.user) {
          setUser(null);
          setIsLoading(false);
          return;
        }

        const overrides = loadProfileOverrides();
        const extra = overrides[data.user.id] ?? {};
        setUser({
          ...data.user,
          bio: extra.bio ?? null,
          hasPassword: data.account?.hasPassword ?? false,
        });
        setIsLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const signUp: AuthState["signUp"] = useCallback(async (data) => {
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      const json = (await res.json().catch(() => ({}))) as
        | AuthUserPayload
        | { error?: string }
        | Record<string, unknown>;

      if (!res.ok) {
        return { ok: false, error: (json as { error?: string })?.error ?? "Sign up failed" };
      }

      const nextUser = (json as AuthUserPayload)?.user;
      if (nextUser) {
        const overrides = loadProfileOverrides();
        const extra = overrides[nextUser.id] ?? {};
        setUser({
          ...nextUser,
          bio: extra.bio ?? null,
          hasPassword: (json as AuthUserPayload).account?.hasPassword ?? true,
        });
      }
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error" };
    }
  }, []);

  const signIn: AuthState["signIn"] = useCallback(async (data) => {
    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      const json = (await res.json().catch(() => ({}))) as
        | AuthUserPayload
        | { error?: string }
        | Record<string, unknown>;

      if (!res.ok) {
        return { ok: false, error: (json as { error?: string })?.error ?? "Sign in failed" };
      }

      const nextUser = (json as AuthUserPayload)?.user;
      if (nextUser) {
        const overrides = loadProfileOverrides();
        const extra = overrides[nextUser.id] ?? {};
        setUser({
          ...nextUser,
          bio: extra.bio ?? null,
          hasPassword: (json as AuthUserPayload).account?.hasPassword ?? true,
        });
      }
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error" };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      setUser(null);
      window.location.href = "/";
    }
  }, []);

  const login = useCallback(() => {
    window.location.href = "/login";
  }, []);

  const updateProfile = useCallback(
    async (updates: {
      firstName: string;
      lastName: string;
      bio?: string | null;
    }) => {
      if (!user) return { ok: false, error: "Not signed in" } as const;

      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstName: updates.firstName,
          lastName: updates.lastName,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as
        | { user?: BackendAuthUser; error?: string }
        | Record<string, unknown>;

      if (!res.ok) {
        return {
          ok: false,
          error: (json as { error?: string }).error ?? "Could not update profile",
        } as const;
      }

      const next = (json as { user: BackendAuthUser }).user;
      const bio =
        updates.bio !== undefined ? updates.bio : user.bio ?? null;

      const overrides = loadProfileOverrides();
      overrides[user.id] = { bio };
      saveProfileOverrides(overrides);

      setUser({
        ...next,
        bio,
        hasPassword: user.hasPassword,
      });

      return { ok: true } as const;
    },
    [user],
  );

  const changePassword = useCallback(
    async (data: { currentPassword: string; newPassword: string }) => {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });

      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };

      if (!res.ok) {
        return {
          ok: false,
          error: json.error ?? json.message ?? "Could not change password",
        } as const;
      }

      return { ok: true } as const;
    },
    [],
  );

  const value: AuthState = {
    user,
    isLoading,
    isAuthenticated: !!user,
    signUp,
    signIn,
    logout,
    login,
    updateProfile,
    changePassword,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
