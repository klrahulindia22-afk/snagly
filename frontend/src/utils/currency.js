/**
 * Currency detection and formatting utility.
 * Base prices stored in DB are INR. This module converts them for display
 * based on the visitor's detected country.
 */

// Currency definitions: symbol, INR conversion rate, decimal places
export const CURRENCIES = {
  INR: { code: 'INR', symbol: '₹',    rate: 1,       dec: 0 },
  USD: { code: 'USD', symbol: '$',     rate: 0.012,   dec: 2 },
  EUR: { code: 'EUR', symbol: '€',     rate: 0.011,   dec: 2 },
  GBP: { code: 'GBP', symbol: '£',    rate: 0.0094,  dec: 2 },
  AUD: { code: 'AUD', symbol: 'A$',   rate: 0.018,   dec: 2 },
  CAD: { code: 'CAD', symbol: 'CA$',  rate: 0.016,   dec: 2 },
  SGD: { code: 'SGD', symbol: 'S$',   rate: 0.016,   dec: 2 },
  AED: { code: 'AED', symbol: 'AED ', rate: 0.044,   dec: 0 },
  JPY: { code: 'JPY', symbol: '¥',    rate: 1.82,    dec: 0 },
  MYR: { code: 'MYR', symbol: 'RM ',  rate: 0.056,   dec: 2 },
}

// Country code → currency code
const COUNTRY_TO_CURRENCY = {
  IN: 'INR',
  US: 'USD', CA: 'USD',
  GB: 'GBP',
  AU: 'AUD', NZ: 'AUD',
  SG: 'SGD', MY: 'MYR',
  JP: 'JPY',
  AE: 'AED', SA: 'AED', QA: 'AED', KW: 'AED', BH: 'AED', OM: 'AED',
  DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR', BE: 'EUR',
  AT: 'EUR', PT: 'EUR', FI: 'EUR', GR: 'EUR', IE: 'EUR', LU: 'EUR',
  SE: 'EUR', NO: 'EUR', DK: 'EUR', CH: 'EUR', PL: 'EUR', CZ: 'EUR',
}

export const DEFAULT_CURRENCY = CURRENCIES.USD

export function currencyForCountry(countryCode) {
  const code = COUNTRY_TO_CURRENCY[countryCode] || 'USD'
  return CURRENCIES[code] || DEFAULT_CURRENCY
}

/**
 * Format an INR amount in the given currency for display.
 * @param {number} inrAmount - base price in INR from the DB
 * @param {object} currency  - currency object from CURRENCIES
 * @param {string} period    - optional suffix like '/mo' or '/yr'
 */
export function formatPrice(inrAmount, currency, period = '') {
  if (!inrAmount || Number(inrAmount) <= 0) return 'Free'
  const converted = Number(inrAmount) * currency.rate
  const formatted = currency.dec === 0
    ? Math.round(converted).toLocaleString()
    : converted < 10
      ? converted.toFixed(currency.dec)
      : Math.round(converted).toLocaleString()
  return `${currency.symbol}${formatted}${period}`
}

/**
 * Detect the visitor's country via ipapi.co and resolve a currency.
 * Result is cached in sessionStorage to avoid repeated API calls.
 */
export async function detectCurrency() {
  const CACHE_KEY = 'snagly_currency'
  try {
    const cached = sessionStorage.getItem(CACHE_KEY)
    if (cached) return JSON.parse(cached)
  } catch { /* ignore */ }

  try {
    const res  = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(4000) })
    const data = await res.json()
    const currency = currencyForCountry(data.country_code)
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(currency)) } catch { /* ignore */ }
    return currency
  } catch {
    return CURRENCIES.INR // fallback — default to INR
  }
}
