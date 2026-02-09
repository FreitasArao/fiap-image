export interface EnvelopeMetadata {
  messageId: string
  correlationId: string
  traceId: string
  spanId: string
  source: string
  eventType: string
  version: string
  timestamp: string
  retryCount: number
  maxRetries: number
}

export interface MessageEnvelope<T> {
  metadata: EnvelopeMetadata
  payload: T
}

export interface MessageContext {
  metadata: EnvelopeMetadata
  messageId?: string
}

export interface TracingContext {
  traceId: string
  spanId: string
}

export interface CreateMetadataOptions {
  correlationId: string
  eventType: string
  source: string
  traceId?: string
  spanId?: string
  version?: string
  retryCount?: number
  maxRetries?: number
}

export interface PublishOptions {
  eventType: string
  correlationId: string
  source?: string
  traceId?: string
  spanId?: string
}
