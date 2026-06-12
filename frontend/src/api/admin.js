import client from './client'

// ── Users ──────────────────────────────────────────────────────────────────────
export async function getAdminUsers(page = 1, perPage = 50) {
  const { data } = await client.get('/admin/users', { params: { page, per_page: perPage } })
  return data
}

export async function createAdminUser(payload) {
  const { data } = await client.post('/admin/users', payload)
  return data.data
}

export async function updateAdminUser(id, payload) {
  const { data } = await client.patch(`/admin/users/${id}`, payload)
  return data.data
}

export async function deactivateAdminUser(id) {
  const { data } = await client.delete(`/admin/users/${id}`)
  return data.data
}

// ── Boards ──────────────────────────────────────────────────────────────────────
export async function getAdminBoards(page = 1, perPage = 50) {
  const { data } = await client.get('/admin/boards', { params: { page, per_page: perPage } })
  return data
}

export async function updateBoardMemberLimit(id, memberLimit) {
  const { data } = await client.patch(`/admin/boards/${id}/member-limit`, { member_limit: memberLimit })
  return data.data
}

// ── Invites ──────────────────────────────────────────────────────────────────────
export async function getAdminInvites(page = 1, perPage = 50) {
  const { data } = await client.get('/admin/invites', { params: { page, per_page: perPage } })
  return data
}

export async function cancelAdminInvite(id) {
  const { data } = await client.delete(`/admin/invites/${id}`)
  return data.data
}

// ── Stats ──────────────────────────────────────────────────────────────────────
export async function getAdminStats() {
  const { data } = await client.get('/admin/stats')
  return data.data
}
