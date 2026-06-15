import { create } from 'zustand'
import { getMySubscription } from '../api/subscription'

const useSubscriptionStore = create((set, get) => ({
  subscription: null,
  plan: null,
  usage: null,
  planLimits: {},   // map: feature_key → { is_enabled, limit_value }
  loading: false,
  loaded: false,

  setData: (data) => {
    const limits = {}
    ;(data?.plan?.feature_flags || []).forEach((f) => {
      limits[f.feature_key] = f
    })
    set({
      subscription: data?.subscription ?? null,
      plan:         data?.plan         ?? null,
      usage:        data?.usage        ?? null,
      planLimits:   limits,
      loaded:       true,
    })
  },

  refresh: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const data = await getMySubscription()
      get().setData(data)
    } catch {
      // silently ignore — UI shows stale data
    } finally {
      set({ loading: false })
    }
  },

  clear: () => set({
    subscription: null, plan: null, usage: null,
    planLimits: {}, loaded: false,
  }),
}))

// Auto-refresh: re-fetch plan when the user switches back to this tab
// or after 5 minutes — ensures admin plan changes propagate without a full reload.
if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return
    const { loaded, loading, refresh } = useSubscriptionStore.getState()
    if (loaded && !loading) refresh()
  })

  setInterval(() => {
    const { loaded, loading, refresh } = useSubscriptionStore.getState()
    if (loaded && !loading) refresh()
  }, 5 * 60 * 1000)
}

export default useSubscriptionStore
