import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { completeAuthCallbackFromUrl, getAuthCallbackFromUrl, isRecoveryCallbackUrl } from '@/lib/authCallback';
import { claimInvitationProfile } from '@/lib/applyInviteProfile';
import { shouldClaimInvitationProfile } from '@/lib/inviteClaim';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const authReadyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapAuth() {
      try {
        const path = typeof window !== "undefined" ? window.location.pathname : "";

        if (path === "/auth/callback") {
          authReadyRef.current = true;
          return;
        }

        const callback = getAuthCallbackFromUrl();
        if (callback?.kind === "pkce") {
          const search = window.location.search || "";
          const hash = window.location.hash || "";
          window.location.replace(`/auth/callback${search}${hash}`);
          return;
        }

        const isResetRoute = path === "/auth/reset-password" || path === "/auth/accept-invite";
        if (!isResetRoute && callback?.kind === "oauth") {
          const { error } = await completeAuthCallbackFromUrl(supabase);
          if (error && !cancelled) {
            console.warn("Auth callback failed:", error.message);
          }
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session?.user) {
          setAuthUser(session.user);
          await loadProfile(session.user);
        } else {
          setIsLoadingAuth(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("Auth bootstrap failed:", err);
          setIsLoadingAuth(false);
        }
      } finally {
        authReadyRef.current = true;
      }
    }

    bootstrapAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;

      if (event === "PASSWORD_RECOVERY" && session?.user) {
        const path = typeof window !== "undefined" ? window.location.pathname : "";
        if (path !== "/auth/reset-password" && isRecoveryCallbackUrl()) {
          const search = typeof window !== "undefined" ? window.location.search || "" : "";
          const h = typeof window !== "undefined" ? window.location.hash || "" : "";
          window.location.replace(`${window.location.origin}/auth/reset-password${search}${h}`);
          return;
        }
      }

      if (session?.user) {
        setAuthUser(session.user);
        if (authReadyRef.current) {
          loadProfile(session.user);
        }
        return;
      }

      if (!authReadyRef.current || event === "INITIAL_SESSION") {
        return;
      }

      setAuthUser(null);
      setUser(null);
      setIsLoadingAuth(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  async function loadProfile(authSessionUser) {
    const sessionUser = authSessionUser || authUser;
    if (!sessionUser?.id) {
      setIsLoadingAuth(false);
      return;
    }
    const metaRole = sessionUser.user_metadata?.role;
    const metaName = sessionUser.user_metadata?.full_name;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', sessionUser.id)
      .maybeSingle();

    if (error) {
      setUser(null);
      setIsLoadingAuth(false);
      return;
    }

    if (!data) {
      if (shouldClaimInvitationProfile(sessionUser, null)) {
        const claim = await claimInvitationProfile().catch(() => ({ skipped: true }));
        if (claim?.ok && !claim?.skipped) {
          await loadProfile(sessionUser);
          return;
        }
      }
      setUser({
        id: sessionUser.id,
        email: sessionUser.email,
        full_name: metaName || sessionUser.email?.split('@')[0] || '',
        role: metaRole || 'user',
        phone: null,
      });
      setIsLoadingAuth(false);
      return;
    }

    if (shouldClaimInvitationProfile(sessionUser, data)) {
      const claim = await claimInvitationProfile().catch(() => ({ skipped: true }));
      if (claim?.ok && !claim?.skipped && claim.role && String(claim.role).toLowerCase() !== 'user') {
        await loadProfile(sessionUser);
        return;
      }
    }
    const profileRole = data.role != null ? String(data.role).trim() : '';
    const metaRoleTrim = metaRole != null ? String(metaRole).trim() : '';
    const role =
      metaRoleTrim && (!profileRole || profileRole.toLowerCase() === 'user')
        ? metaRoleTrim
        : profileRole || metaRoleTrim || 'user';

    setUser({
      ...data,
      role,
      full_name: data.full_name || metaName || '',
    });
    setIsLoadingAuth(false);
  }

  async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data?.user) {
      setAuthUser(data.user);
      await loadProfile(data.user);
    }
    return data;
  }

  function navigateToLogin() {
    window.location.href = '/login';
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  const effectiveUser = user || authUser;
  const isAuthenticated = !!authUser;

  return (
    <AuthContext.Provider value={{ user: effectiveUser, isLoadingAuth, isAuthenticated, login, navigateToLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
