import { createContext, useContext, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

const AuthContext = createContext(null);

/**
 * The session lives in an httpOnly cookie the browser cannot read, so the only
 * way to know who is signed in is to ask the server. /auth/me is that question,
 * and it is what restores a session across a page reload.
 */
export function AuthProvider({ children }) {
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await api.get('/auth/me')).data,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const login = useMutation({
    mutationFn: async (credentials) => (await api.post('/auth/login', credentials)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auth', 'me'] }),
  });

  const logout = useMutation({
    mutationFn: async () => (await api.post('/auth/logout')).data,
    onSuccess: () => {
      // Clear everything, not just the session: cached queue data belongs to the
      // account that just signed out.
      queryClient.clear();
    },
  });

  const changePassword = useMutation({
    mutationFn: async (body) => (await api.post('/auth/change-password', body)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auth', 'me'] }),
  });

  const hasRole = useCallback(
    (...roles) => Boolean(data?.user && roles.includes(data.user.role)),
    [data]
  );

  const value = {
    user: data?.user ?? null,
    organization: data?.organization ?? null,
    mustChangePassword: Boolean(data?.mustChangePassword),
    isLoading: isPending,
    isAuthenticated: Boolean(data?.user),
    isAdmin: data?.user?.role === 'admin',
    isRescuer: data?.user?.role === 'ngo' || data?.user?.role === 'helper',
    hasRole,
    login,
    logout,
    changePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
