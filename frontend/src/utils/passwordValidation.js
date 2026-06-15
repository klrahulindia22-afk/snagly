export const PASSWORD_RULES = [
  {
    key: 'length',
    label: 'At least 8 characters',
    test: p => p.length >= 8,
  },
  {
    key: 'letter',
    label: 'Contains a letter (a–z or A–Z)',
    test: p => /[a-zA-Z]/.test(p),
  },
  {
    key: 'number',
    label: 'Contains a number (0–9)',
    test: p => /[0-9]/.test(p),
  },
  {
    key: 'special',
    label: 'Contains a special character (!@#$%…)',
    test: p => /[^a-zA-Z0-9]/.test(p),
  },
  {
    key: 'noRepeat',
    label: 'No consecutive repeated characters (e.g. aa, 11)',
    test: p => !/(.)\1/.test(p),
  },
]

export const checkPassword = password =>
  PASSWORD_RULES.map(r => ({ ...r, passed: r.test(password) }))

export const isPasswordValid = password =>
  PASSWORD_RULES.every(r => r.test(password))

export const friendlyLoginError = raw => {
  if (!raw) return 'Login failed. Please try again.'
  const msg = (typeof raw === 'string' ? raw : raw.message || '').toLowerCase()
  if (msg.includes('invalid credentials') || msg.includes('invalid email') || msg.includes('incorrect') || msg.includes('wrong'))
    return 'Incorrect email or password. Please try again.'
  if (msg.includes('not verified') || msg.includes('verify'))
    return 'Please verify your email address before signing in.'
  if (msg.includes('locked') || msg.includes('lockout'))
    return 'Your account is temporarily locked after too many failed attempts. Try again later or reset your password.'
  if (msg.includes('inactive') || msg.includes('deactivated'))
    return 'Your account has been deactivated. Please contact support.'
  if (msg.includes('2fa') || msg.includes('two'))
    return 'Two-factor authentication is required.'
  return raw?.message || raw || 'Login failed. Please check your credentials.'
}
