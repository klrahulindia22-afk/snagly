import { useEffect } from 'react'
import useSubscriptionStore from '../stores/subscriptionStore'
import useAuthStore from '../stores/authStore'

export function usePlanLimits() {
  const { subscription, plan, usage, planLimits, loaded, loading, refresh } = useSubscriptionStore()
  const accessToken = useAuthStore((s) => s.accessToken)

  useEffect(() => {
    if (accessToken && !loaded && !loading) refresh()
  }, [accessToken, loaded, loading, refresh])

  // ── Helpers ────────────────────────────────────────────────────────────────

  const flag = (key) => planLimits[key] || { is_enabled: false, limit_value: null }

  /** True when user can create another board (not over max_boards limit).
   *  Returns false while subscription data is still loading to avoid a
   *  race where usage is null and the limit appears to be "unlimited". */
  const canCreateBoard = () => {
    if (!loaded) return false
    const lim = usage?.boards_limit
    if (lim == null) return true           // unlimited plan
    return (usage?.boards_used ?? 0) < lim
  }

  /** True when board can accept another member (not over max_members_per_board).
   *  Returns false while loading for the same safety reason. */
  const canInviteMember = () => {
    if (!loaded) return false
    const lim = usage?.members_limit
    if (lim == null) return true
    return (usage?.members_max_any_board ?? 0) < lim
  }

  /** True when plan has this feature enabled (bool flags). */
  const isFeatureEnabled = (key) => flag(key).is_enabled

  /** Bytes of storage remaining; Infinity when unlimited. */
  const getRemainingStorage = () => {
    if (!usage?.storage_limit_bytes) return Infinity
    return Math.max(0, usage.storage_limit_bytes - (usage.storage_used_bytes ?? 0))
  }

  /** Storage used as a percentage 0–100. */
  const getStoragePct = () => {
    if (!usage?.storage_limit_bytes) return 0
    return Math.min(100, ((usage.storage_used_bytes ?? 0) / usage.storage_limit_bytes) * 100)
  }

  /** Max file size in bytes allowed by plan; 0 = unlimited. */
  const getMaxFileSizeBytes = () => {
    const mb = flag('max_file_size_mb').limit_value
    if (!mb) return 0
    return mb * 1024 * 1024
  }

  /** Max attachments per card; 0 = unlimited. */
  const getMaxAttachmentsPerCard = () => flag('max_attachments_per_card').limit_value || 0

  return {
    subscription,
    plan,
    usage,
    planLimits,
    loaded,
    refresh,
    canCreateBoard,
    canInviteMember,
    isFeatureEnabled,
    getRemainingStorage,
    getStoragePct,
    getMaxFileSizeBytes,
    getMaxAttachmentsPerCard,
  }
}
