/**
 * Structured log payload for observability (ADR 016).
 * Enables Log-based Metrics in Datadog via stable event names and standard fields.
 * @see docs/adrs/16.md
 */
export type LogEvent = {
  message: string
  event: string
  resource?: string
  status?: 'success' | 'failure' | 'skipped'
  /** Duration in nanoseconds (Datadog standard) */
  duration?: number
  error?: {
    message: string
    kind: string
    stack?: string
  }
  [key: string]: unknown
}

/** Convert milliseconds to nanoseconds (Datadog standard). */
export const msToNs = (ms: number): number => Math.round(ms * 1_000_000)
