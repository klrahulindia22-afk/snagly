import client from './client'

export async function login(email, password) {
  const { data } = await client.post('/auth/login', { email, password })
  return data.data
}

export async function signup(email, fullName, password) {
  const { data } = await client.post('/auth/signup', { email, full_name: fullName, password })
  return data.data
}

export async function verifyEmail(email, otp) {
  const { data } = await client.post('/auth/verify-email', { email, otp })
  return data.data
}

export async function resendOtp(email) {
  const { data } = await client.post('/auth/resend-otp', { email })
  return data.data
}

export async function login2fa(email, method, code) {
  const { data } = await client.post('/auth/login-2fa', { email, method, code })
  return data.data
}

export async function request2faOtp(email) {
  const { data } = await client.post('/auth/request-2fa-otp', { email })
  return data.data
}

export async function setup2fa() {
  const { data } = await client.post('/auth/setup-2fa')
  return data.data
}

export async function confirm2fa(totpCode) {
  const { data } = await client.post('/auth/confirm-2fa', { totp_code: totpCode })
  return data.data
}

export async function disable2fa() {
  const { data } = await client.post('/auth/disable-2fa')
  return data.data
}

export async function refreshAccessToken(refreshToken) {
  const { data } = await client.post('/auth/refresh', { refresh_token: refreshToken })
  return data.data
}

export async function forgotPassword(email) {
  const { data } = await client.post('/auth/forgot-password', { email })
  return data.data
}

export async function resetPassword(token, newPassword) {
  const { data } = await client.post('/auth/reset-password', { token, new_password: newPassword })
  return data.data
}

export async function getMe() {
  const { data } = await client.get('/users/me')
  return data.data
}

export async function getAdminSettings() {
  const { data } = await client.get('/admin/settings')
  return data.data
}

export async function updateAdminSettings(updates) {
  const { data } = await client.patch('/admin/settings', { updates })
  return data.data
}
