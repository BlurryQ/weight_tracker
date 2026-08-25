export const DAY_MS = 86400000

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Parses an ISO date string ('YYYY-MM-DD') as UTC midnight, matching how dates are stored and compared everywhere in this app. */
export function parseDate(iso: string): Date {
  return new Date(iso + 'T00:00:00Z')
}

/** Formats a Date as an ISO date string ('YYYY-MM-DD') in UTC. */
export function toIso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** The current date as an ISO string. The one place `new Date()` (wall clock) is read — every other function takes `today` as a parameter so the module stays pure and testable. */
export function today(): string {
  return toIso(new Date())
}

/** The Monday (ISO week start) on or before the given date, as an ISO string. */
export function mondayOf(iso: string): string {
  const d = parseDate(iso)
  const dow = d.getUTCDay() // 0 = Sunday
  const back = dow === 0 ? 6 : dow - 1
  return toIso(new Date(d.getTime() - back * DAY_MS))
}

export function addDays(iso: string, days: number): string {
  return toIso(new Date(parseDate(iso).getTime() + days * DAY_MS))
}

/** Whole days between two ISO dates (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / DAY_MS)
}

/** '25.08' style short date, used in the Today screen header. */
export function shortDate(iso: string): string {
  const d = parseDate(iso)
  return String(d.getUTCDate()).padStart(2, '0') + '.' + String(d.getUTCMonth() + 1).padStart(2, '0')
}

/** '19 Nov 2026' style full date, used in Reach card output and History. */
export function fullDate(iso: string): string {
  const d = parseDate(iso)
  return `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** 'Tue 18 Aug' style label, used in entry sheet titles and phase-week notes. */
export function dayLabel(iso: string): string {
  const d = parseDate(iso)
  return `${DAY_NAMES[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`
}

/** 'WC dd/mm' style label used in History week rows. */
export function weekCommencingLabel(monday: string): string {
  const d = parseDate(monday)
  return 'WC ' + String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0')
}

export { DAY_NAMES }
