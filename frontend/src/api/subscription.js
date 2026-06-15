import client from './client'

export const getMySubscription = () =>
  client.get('/subscriptions/me').then((r) => r.data.data)

export const getPlans = () =>
  client.get('/plans').then((r) => r.data.data)

export const checkout = (payload) =>
  client.post('/subscriptions/checkout', payload).then((r) => r.data.data)

export const validateCoupon = (code, planId) =>
  client.post('/subscriptions/validate-coupon', { code, plan_id: planId }).then((r) => r.data.data)

export const upgrade = (planId) =>
  client.post('/subscriptions/upgrade', { plan_id: planId }).then((r) => r.data.data)

export const downgrade = (planId) =>
  client.post('/subscriptions/downgrade', { plan_id: planId }).then((r) => r.data.data)

export const cancel = (reason) =>
  client.post('/subscriptions/cancel', { reason }).then((r) => r.data.data)

export const reactivate = () =>
  client.post('/subscriptions/reactivate').then((r) => r.data.data)

export const switchCycle = (billingCycle) =>
  client.post('/subscriptions/switch-cycle', { billing_cycle: billingCycle }).then((r) => r.data.data)

export const applyCoupon = (code) =>
  client.post('/subscriptions/apply-coupon', { code }).then((r) => r.data.data)

export const getInvoices = ({ page = 1, perPage = 10 } = {}) =>
  client.get('/invoices', { params: { page, per_page: perPage } }).then((r) => r.data)

export const getInvoicePdfUrl = (id) =>
  `${client.defaults.baseURL}/invoices/${id}/pdf`

export const getMyPaymentMethod = () =>
  client.get('/payment-methods/me').then((r) => r.data.data?.[0] ?? null)
