import { checkPassword } from '../../utils/passwordValidation'

export default function PasswordStrengthMeter({ password }) {
  if (!password) return null

  const results     = checkPassword(password)
  const passedCount = results.filter(r => r.passed).length
  const total       = results.length

  const barColor =
    passedCount <= 1 ? '#ef4444' :
    passedCount <= 3 ? '#f97316' :
    passedCount === 4 ? '#eab308' :
    '#22c55e'

  const strengthLabel =
    passedCount <= 1 ? 'Very weak' :
    passedCount <= 2 ? 'Weak' :
    passedCount <= 3 ? 'Fair' :
    passedCount === 4 ? 'Good' :
    'Strong'

  return (
    <div
      className="mt-2 rounded-lg p-3 space-y-2.5"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      {/* Bar + label */}
      <div className="space-y-1">
        <div className="flex gap-1">
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full transition-all duration-200"
              style={{ background: i < passedCount ? barColor : 'rgba(255,255,255,0.1)' }}
            />
          ))}
        </div>
        <div className="flex justify-between items-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Password requirements
          </p>
          <p className="text-[10px] font-semibold" style={{ color: barColor }}>
            {strengthLabel}
          </p>
        </div>
      </div>

      {/* Criteria list */}
      <div className="space-y-1.5">
        {results.map(r => (
          <div key={r.key} className="flex items-center gap-2">
            <span
              className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 transition-all duration-200"
              style={{
                background: r.passed ? '#22c55e' : 'rgba(255,255,255,0.1)',
                color: r.passed ? '#fff' : 'rgba(255,255,255,0.35)',
              }}
            >
              {r.passed ? '✓' : '✗'}
            </span>
            <span
              className="text-xs transition-colors duration-200"
              style={{ color: r.passed ? '#86efac' : 'rgba(255,255,255,0.45)' }}
            >
              {r.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
