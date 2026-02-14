import { Elysia } from 'elysia'
import { logger } from './index'
import { msToNs } from '@core/libs/logging/log-event'
import type { DatadogLogMeta } from '@core/libs/logging/abstract-logger'

const requestStartTime = new WeakMap<Request, number>()

export const loggerPlugin = new Elysia({ name: 'logger' })
  .derive({ as: 'scoped' }, ({ path, request }) => {
    const method = request.method

    requestStartTime.set(request, performance.now())

    return {
      logger: logger.withContext(`${method} ${path}`),
    }
  })
  .onAfterHandle({ as: 'global' }, ({ request, path, set }) => {
    const startTime = requestStartTime.get(request)
    if (!startTime) return

    const durationMs = performance.now() - startTime
    const statusCode = typeof set.status === 'number' ? set.status : 200
    const status = statusCode >= 400 ? 'failure' : 'success'
    const message = `${request.method} ${path} ${statusCode} ${Math.round(durationMs)}ms`

    const meta: DatadogLogMeta = {
      event: 'http.request.completed',
      resource: 'HttpServer',
      message,
      'http.method': request.method,
      'http.url': path,
      'http.status_code': statusCode,
      'http.url_details.path': path.split('?')[0],
      'network.client.ip':
        request.headers.get('x-forwarded-for') ??
        request.headers.get('x-real-ip') ??
        undefined,
      duration: msToNs(durationMs),
      status,
    }

    logger.log(message, meta)
  })
  .onError({ as: 'global' }, ({ request, path, set, error }) => {
    const startTime = requestStartTime.get(request)
    const durationMs = startTime ? performance.now() - startTime : 0
    const statusCode = typeof set.status === 'number' ? set.status : 500

    const meta: DatadogLogMeta = {
      event: 'http.request.error',
      resource: 'HttpServer',
      message: `HTTP request failed: ${request.method} ${path} ${statusCode}`,
      'http.method': request.method,
      'http.url': path,
      'http.status_code': statusCode,
      'http.url_details.path': path.split('?')[0],
      'network.client.ip':
        request.headers.get('x-forwarded-for') ??
        request.headers.get('x-real-ip') ??
        undefined,
      duration: msToNs(durationMs),
      status: 'failure',
      error: {
        message: error instanceof Error ? error.message : String(error),
        kind: error instanceof Error ? error.constructor.name : 'Error',
        stack: error instanceof Error ? error.stack : undefined,
      },
    }

    logger.error(meta.message, meta)
  })
