import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/api/supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setAuthUser(session.user);
        loadProfile(session.user);
      } else {
        setIsLoadingAuth(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session?.user) {
        const path = typeof window !== "undefined" ? window.location.pathname : "";
        if (path !== "/auth/reset-password") {
          const h = typeof window !== "undefined" ? window.location.hash || "" : "";
          window.location.replace(`${window.location.origin}/auth/reset-password${h}`);
          return;
        }
      }
      if (session?.user) {
        setAuthUser(session.user);
        loadProfile(session.user);
      } else {
        setAuthUser(null);
        setUser(null);
        setIsLoadingAuth(false);
      }
    });

    return () => subscription.unsubscribe();
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

    const profileRole = data.role != null ? String(data.role).trim() : '';
    const metaRoleTrim = metaRole != null ? String(metaRole).trim() : '';
    // Invites put the real role in JWT metadata; profiles may still say "user" until synced.
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
