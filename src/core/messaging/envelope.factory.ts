import type {
  EnvelopeMetadata,
  MessageEnvelope,
  CreateMetadataOptions,
} from './envelope.types'
import type { TracingProvider } from './tracing-provider'
import { defaultTracingProvider } from './tracing-provider'

const DEFAULT_VERSION = '1.0'
const DEFAULT_MAX_RETRIES = 3

export class EnvelopeFactory {
  constructor(private readonly tracingProvider?: TracingProvider) {}

  createMetadata(options: CreateMetadataOptions): EnvelopeMetadata {
    const provider = this.tracingProvider ?? defaultTracingProvider
    const tracingContext = provider.getActiveContext()

    const traceId =
      options.traceId ?? tracingContext?.traceId ?? crypto.randomUUID()
    const spanId =
      options.spanId ?? tracingContext?.spanId ?? crypto.randomUUID()

    return {
      messageId: crypto.randomUUID(),
      correlationId: options.correlationId,
      traceId,
      spanId,
      source: options.source,
      eventType: options.eventType,
      version: options.version ?? DEFAULT_VERSION,
      timestamp: new Date().toISOString(),
      retryCount: options.retryCount ?? 0,
      maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
    }
  }

  createEnvelope<T>(
    payload: T,
    options: CreateMetadataOptions,
  ): MessageEnvelope<T> {
    return {
      metadata: this.createMetadata(options),
      payload,
    }
  }
}

export const defaultEnvelopeFactory = new EnvelopeFactory()
