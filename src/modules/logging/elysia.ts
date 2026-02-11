import { Elysia } from 'elysia'
import { logger } from './index'
import type { DatadogLogMeta } from '@core/libs/logging/abstract-logger'

/** Convert milliseconds to nanoseconds (Datadog standard) */
const msToNs = (ms: number): number => Math.round(ms * 1_000_000)

const REQUEST_START_SYMBOL = Symbol('requestStart')

export const loggerPlugin = new Elysia({ name: 'logger' })
  .derive(({ path, request }) => {
    const method = request.method

    // Store request start time for duration calculation
    ;(request as Record<symbol, unknown>)[REQUEST_START_SYMBOL] =
      performance.now()

    return {
      logger: logger.withContext(`${method} ${path}`),
    }
  })
  .onAfterHandle({ as: 'global' }, ({ request, path, set }) => {
    const startTime = (request as Record<symbol, unknown>)[
      REQUEST_START_SYMBOL
    ] as number | undefined
    if (!startTime) return

    const durationMs = performance.now() - startTime
    const statusCode = typeof set.status === 'number' ? set.status : 200

    const meta: DatadogLogMeta = {
      'http.method': request.method,
      'http.url': path,
      'http.status_code': statusCode,
      'http.url_details.path': path.split('?')[0],
      'network.client.ip':
        request.headers.get('x-forwarded-for') ??
        request.headers.get('x-real-ip') ??
        undefined,
      duration: msToNs(durationMs),
      status: statusCode >= 400 ? 'error' : 'ok',
    }

    logger.log('http.request', meta)
  })
  .onError({ as: 'global' }, ({ request, path, set, error }) => {
    const startTime = (request as Record<symbol, unknown>)[
      REQUEST_START_SYMBOL
    ] as number | undefined
    const durationMs = startTime ? performance.now() - startTime : 0
    const statusCode = typeof set.status === 'number' ? set.status : 500

    const meta: DatadogLogMeta = {
      'http.method': request.method,
      'http.url': path,
      'http.status_code': statusCode,
      'http.url_details.path': path.split('?')[0],
      'network.client.ip':
        request.headers.get('x-forwarded-for') ??
        request.headers.get('x-real-ip') ??
        undefined,
      duration: msToNs(durationMs),
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    }

    logger.error('http.request.error', meta)
  })
