import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import wsService from '../services/wsService'

const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      initialized: false,  // true once startup silent-refresh is done

      setTokens: (accessToken, refreshToken) => {
        set({ accessToken, refreshToken, initialized: true })
        wsService.connect(accessToken)
      },
      setUser: (user) => set({ user }),
      setAuth: (accessToken, refreshToken, user) => {
        set({ accessToken, refreshToken, user, initialized: true })
        wsService.connect(accessToken)
      },
      setInitialized: () => set({ initialized: true }),
      isAuthenticated: () => !!get().accessToken,

      logout: () => {
        wsService.disconnect()
        set({ user: null, accessToken: null, refreshToken: null, initialized: true })
      },
    }),
    {
      name: 'bugtrack-auth',
      // Persist refreshToken so silent re-auth works on page reload.
      // Access token stays in memory only (short-lived, 15 min).
      partialize: (state) => ({
        user: state.user,
        refreshToken: state.refreshToken,
      }),
    }
  )
)

export default useAuthStore
