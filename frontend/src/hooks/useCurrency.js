import { useState, useEffect } from 'react'
import { detectCurrency, CURRENCIES } from '../utils/currency'

/**
 * Detects the visitor's currency once per session and returns it.
 * Falls back to INR while detecting.
 */
export default function useCurrency() {
  const [currency, setCurrency] = useState(CURRENCIES.INR)
  const [detecting, setDetecting] = useState(true)

  useEffect(() => {
    detectCurrency()
      .then(setCurrency)
      .finally(() => setDetecting(false))
  }, [])

  return { currency, detecting }
}
