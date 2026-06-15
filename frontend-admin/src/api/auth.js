import client from './client'

export async function login(email, password) {
  const { data } = await client.post('/auth/login', { email, password })
  return data.data
}

export async function login2fa(preAuthToken, method, code) {
  const { data } = await client.post(
    '/auth/login-2fa',
    { method, code },
    { headers: { Authorization: `Bearer ${preAuthToken}` } }
  )
  return data.data
}

export async function getMe() {
  const { data } = await client.get('/users/me')
  return data.data
}

export async function forgotPassword(email) {
  const { data } = await client.post('/auth/forgot-password', {
    email,
    frontend_url: window.location.origin,   // sends reset link to THIS admin app
  })
  return data.data
}

export async function resetPassword(token, newPassword) {
  const { data } = await client.post('/auth/reset-password', { token, new_password: newPassword })
  return data.data
}

export async function updateProfile(payload) {
  const { data } = await client.patch('/users/me', payload)
  return data.data
}

export async function uploadAvatar(file) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await client.post('/users/me/avatar', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data.data
}

export async function changePassword(currentPassword, newPassword) {
  const { data } = await client.post('/users/me/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  })
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
