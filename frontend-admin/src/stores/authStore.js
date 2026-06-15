import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      initialized: false,

      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken, initialized: true }),
      setUser: (user) => set({ user }),
      setAuth: (accessToken, refreshToken, user) =>
        set({ accessToken, refreshToken, user, initialized: true }),
      setInitialized: () => set({ initialized: true }),
      isAuthenticated: () => !!get().accessToken,

      logout: () =>
        set({ user: null, accessToken: null, refreshToken: null, initialized: true }),
    }),
    {
      name: 'snagly-admin-auth',
      partialize: (state) => ({
        user: state.user,
        refreshToken: state.refreshToken,
      }),
    }
  )
)

export default useAuthStore
