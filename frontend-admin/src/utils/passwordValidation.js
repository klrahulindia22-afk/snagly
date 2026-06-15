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
