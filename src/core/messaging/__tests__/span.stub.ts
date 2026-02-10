import { mock } from 'bun:test'
import type { Span, SpanContext } from '@opentelemetry/api'

/**
 * Test stub for OpenTelemetry Span.
 * Provides all required Span interface methods as mocks,
 * avoiding the need for `as unknown as Span` casts in tests.
 */
export function createSpanStub(spanContext: Partial<SpanContext> = {}): Span {
  const defaultContext: SpanContext = {
    traceId: spanContext.traceId ?? '',
    spanId: spanContext.spanId ?? '',
    traceFlags: spanContext.traceFlags ?? 0,
  }

  return {
    spanContext: () => defaultContext,
    setAttribute: mock(),
    setAttributes: mock(),
    addEvent: mock(),
    setStatus: mock(),
    updateName: mock(),
    end: mock(),
    isRecording: () => true,
    recordException: mock(),
    addLink: mock(),
  }
}
