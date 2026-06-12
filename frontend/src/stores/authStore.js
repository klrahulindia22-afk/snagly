import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import wsService from '../services/wsService'

const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,

      setTokens: (accessToken, refreshToken) => {
        set({ accessToken, refreshToken })
        wsService.connect(accessToken)
      },
      setUser: (user) => set({ user }),
      setAuth: (accessToken, refreshToken, user) => {
        set({ accessToken, refreshToken, user })
        wsService.connect(accessToken)
      },
      isAuthenticated: () => !!get().accessToken,

      logout: () => {
        wsService.disconnect()
        set({ user: null, accessToken: null, refreshToken: null })
      },
    }),
    {
      name: 'bugtrack-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    }
  )
)

export default useAuthStore
