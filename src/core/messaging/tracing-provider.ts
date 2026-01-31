import { trace, context } from '@opentelemetry/api'
import type { TracingContext } from './envelope.types'

export interface TracingProvider {
  getActiveContext(): TracingContext | null
}

export class OpenTelemetryTracingProvider implements TracingProvider {
  getActiveContext(): TracingContext | null {
    const activeSpan = trace.getSpan(context.active())

    if (!activeSpan) {
      return null
    }

    const spanContext = activeSpan.spanContext()

    if (!spanContext || !spanContext.traceId || !spanContext.spanId) {
      return null
    }

    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
    }
  }
}

export const defaultTracingProvider = new OpenTelemetryTracingProvider()
