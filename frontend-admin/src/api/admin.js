import client from './client'

export async function getAdminUsers({ page = 1, perPage = 20, search = '', role = '', isActive = '' } = {}) {
  const params = { page, per_page: perPage }
  if (search)   params.search = search
  if (role)     params.role = role
  if (isActive !== '') params.is_active = isActive
  const { data } = await client.get('/admin/users', { params })
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

export async function getAdminBoards({ page = 1, perPage = 20, search = '' } = {}) {
  const params = { page, per_page: perPage }
  if (search) params.search = search
  const { data } = await client.get('/admin/boards', { params })
  return data
}

export async function updateBoardMemberLimit(id, memberLimit) {
  const { data } = await client.patch(`/admin/boards/${id}/member-limit`, { member_limit: memberLimit })
  return data.data
}

export async function getAdminInvites({ page = 1, perPage = 20, search = '', role = '' } = {}) {
  const params = { page, per_page: perPage }
  if (search) params.search = search
  if (role)   params.role = role
  const { data } = await client.get('/admin/invites', { params })
  return data
}

export async function cancelAdminInvite(id) {
  const { data } = await client.delete(`/admin/invites/${id}`)
  return data.data
}

export async function getAdminStats() {
  const { data } = await client.get('/admin/stats')
  return data.data
}

export async function getRevenueStats() {
  const { data } = await client.get('/admin/revenue/stats')
  return data.data
}

export async function getAdminSubscriptions({ page = 1, perPage = 20, search = '', planId = '', status = '' } = {}) {
  const params = { page, per_page: perPage }
  if (search)  params.search  = search
  if (planId)  params.plan_id = planId
  if (status)  params.status  = status
  const { data } = await client.get('/admin/subscriptions', { params })
  return data
}

export async function createSubscription(payload) {
  const { data } = await client.post('/admin/subscriptions', payload)
  return data.data
}

export async function updateSubscription(id, payload) {
  const { data } = await client.patch(`/admin/subscriptions/${id}`, payload)
  return data.data
}

export async function getAdminPlans() {
  const { data } = await client.get('/admin/plans')
  return data.data
}

export async function createPlan(payload) {
  const { data } = await client.post('/admin/plans', payload)
  return data.data
}

export async function updatePlan(id, payload) {
  const { data } = await client.patch(`/admin/plans/${id}`, payload)
  return data.data
}

export async function deletePlan(id) {
  await client.delete(`/admin/plans/${id}`)
}

export async function publishPlan(id) {
  const { data } = await client.post(`/admin/plans/${id}/publish`)
  return data.data
}

export async function unpublishPlan(id) {
  const { data } = await client.post(`/admin/plans/${id}/unpublish`)
  return data.data
}

export async function getAdminRevenue() {
  const { data } = await client.get('/admin/revenue')
  return data.data
}

export async function getAdminSubscriptionsPhase16({ page = 1, perPage = 20, search = '', planId = '', gateway = '', status = '' } = {}) {
  const params = { page, per_page: perPage }
  if (search)  params.search   = search
  if (planId)  params.plan_id  = planId
  if (gateway) params.gateway  = gateway
  if (status)  params.status   = status
  const { data } = await client.get('/admin/subscriptions', { params })
  return data
}

export async function overrideSubscriptionPlan(id, planId) {
  const { data } = await client.patch(`/admin/subscriptions/${id}`, { plan_id: planId })
  return data.data
}

export async function getAdminGatewayConfig() {
  const { data } = await client.get('/admin/gateway-config')
  return data.data
}

export async function updateGatewayConfig(payload) {
  const { data } = await client.patch('/admin/gateway-config', payload)
  return data.data
}

export async function getAdminCoupons({ page = 1, perPage = 50 } = {}) {
  const { data } = await client.get('/admin/coupons', { params: { page, per_page: perPage } })
  return data
}

export async function createCoupon(payload) {
  const { data } = await client.post('/admin/coupons', payload)
  return data.data
}

export async function deactivateCoupon(id) {
  const { data } = await client.patch(`/admin/coupons/${id}`, { is_active: false })
  return data.data
}
