import { checkPassword } from '../../utils/passwordValidation'

/**
 * Shows live password criteria checklist.
 * Works with both inline-style auth pages and Tailwind pages.
 * Only renders when `password` is non-empty.
 */
export default function PasswordStrengthMeter({ password, style = {} }) {
  if (!password) return null

  const results = checkPassword(password)
  const passedCount = results.filter(r => r.passed).length
  const total = results.length

  const barColor =
    passedCount <= 1 ? '#de350b' :
    passedCount <= 3 ? '#ff991f' :
    passedCount === 4 ? '#f2d600' :
    '#61bd4f'

  return (
    <div style={{
      marginTop: 8,
      padding: '10px 12px',
      background: '#f8f9fa',
      borderRadius: 6,
      border: '1px solid #e3e6ea',
      ...style,
    }}>
      {/* Strength bar */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: i < passedCount ? barColor : '#dfe1e6',
              transition: 'background 0.2s',
            }}
          />
        ))}
      </div>

      {/* Criteria rows */}
      <p style={{ fontSize: 10, fontWeight: 700, color: '#8993a4', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.6 }}>
        Password requirements
      </p>
      {results.map(r => (
        <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
          <span style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            fontWeight: 700,
            flexShrink: 0,
            background: r.passed ? '#61bd4f' : '#dfe1e6',
            color: r.passed ? '#fff' : '#8993a4',
            transition: 'background 0.2s',
          }}>
            {r.passed ? '✓' : '✗'}
          </span>
          <span style={{ fontSize: 12, color: r.passed ? '#1e6e3e' : '#5e6c84' }}>
            {r.label}
          </span>
        </div>
      ))}
    </div>
  )
}
