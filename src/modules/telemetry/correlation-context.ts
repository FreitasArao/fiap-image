import { Elysia } from 'elysia'
import { trace, context } from '@opentelemetry/api'

export interface RequestTracingContext {
  correlationId: string
  traceId: string
  spanId: string
}

const CORRELATION_ID_HEADER = 'x-correlation-id'
const TRACEPARENT_HEADER = 'traceparent'

function parseTraceparent(
  traceparent: string | null,
): { traceId: string; spanId: string } | null {
  if (!traceparent) return null

  const parts = traceparent.split('-')
  if (parts.length !== 4) return null

  const [, traceId, spanId] = parts
  if (!traceId || !spanId) return null

  return { traceId, spanId }
}

function getOtelContext(): { traceId: string; spanId: string } | null {
  const activeSpan = trace.getSpan(context.active())
  if (!activeSpan) return null

  const spanContext = activeSpan.spanContext()
  if (!spanContext?.traceId || !spanContext?.spanId) return null

  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
  }
}

export const correlationMiddleware = new Elysia({ name: 'correlation' })
  .derive({ as: 'global' }, ({ request }) => {
    const headers = request.headers

    const correlationId =
      headers.get(CORRELATION_ID_HEADER) || crypto.randomUUID()

    const otelContext = getOtelContext()
    const traceparentContext = parseTraceparent(headers.get(TRACEPARENT_HEADER))

    const traceId =
      otelContext?.traceId ?? traceparentContext?.traceId ?? crypto.randomUUID()
    const spanId =
      otelContext?.spanId ?? traceparentContext?.spanId ?? crypto.randomUUID()

    const tracingContext: RequestTracingContext = {
      correlationId,
      traceId,
      spanId,
    }

    return { tracingContext }
  })
  .onAfterHandle({ as: 'global' }, ({ tracingContext, set }) => {
    set.headers[CORRELATION_ID_HEADER] = tracingContext.correlationId

    if (tracingContext.traceId && tracingContext.spanId) {
      set.headers[TRACEPARENT_HEADER] =
        `00-${tracingContext.traceId}-${tracingContext.spanId}-01`
    }
  })
