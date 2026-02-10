import { describe, it, expect } from 'bun:test'
import { EnvelopeFactory, defaultEnvelopeFactory } from '../envelope.factory'
import { TracingProviderStub } from './tracing-provider.stub'

describe('EnvelopeFactory', () => {
  describe('createMetadata', () => {
    it('should create metadata with all required fields', () => {
      const factory = new EnvelopeFactory()

      const metadata = factory.createMetadata({
        correlationId: 'corr-123',
        eventType: 'test.event',
        source: 'fiapx.video',
      })

      expect(metadata.messageId).toBeDefined()
      expect(metadata.messageId.length).toBe(36) // UUID format
      expect(metadata.correlationId).toBe('corr-123')
      expect(metadata.eventType).toBe('test.event')
      expect(metadata.source).toBe('fiapx.video')
      expect(metadata.version).toBe('1.0')
      expect(metadata.timestamp).toBeDefined()
      expect(metadata.retryCount).toBe(0)
      expect(metadata.maxRetries).toBe(3)
    })

    it('should use traceId/spanId from TracingProvider', () => {
      const tracingProvider = TracingProviderStub.withContext(
        'trace-abc',
        'span-xyz',
      )
      const factory = new EnvelopeFactory(tracingProvider)

      const metadata = factory.createMetadata({
        correlationId: 'corr-123',
        eventType: 'test.event',
        source: 'fiapx.video',
      })

      expect(metadata.traceId).toBe('trace-abc')
      expect(metadata.spanId).toBe('span-xyz')
    })

    it('should use UUID fallback when TracingProvider returns null', () => {
      const tracingProvider = TracingProviderStub.noContext()
      const factory = new EnvelopeFactory(tracingProvider)

      const metadata = factory.createMetadata({
        correlationId: 'corr-123',
        eventType: 'test.event',
        source: 'fiapx.video',
      })

      // Should have UUID format (36 chars with dashes)
      expect(metadata.traceId.length).toBe(36)
      expect(metadata.spanId.length).toBe(36)
    })

    it('should allow override of traceId/spanId via options', () => {
      const tracingProvider = TracingProviderStub.withContext(
        'provider-trace',
        'provider-span',
      )
      const factory = new EnvelopeFactory(tracingProvider)

      const metadata = factory.createMetadata({
        correlationId: 'corr-123',
        eventType: 'test.event',
        traceId: 'override-trace',
        source: 'custom-source',
        spanId: 'override-span',
      })

      expect(metadata.traceId).toBe('override-trace')
      expect(metadata.spanId).toBe('override-span')
    })

    it('should use custom source when provided', () => {
      const factory = new EnvelopeFactory()

      const metadata = factory.createMetadata({
        correlationId: 'corr-123',
        eventType: 'test.event',
        source: 'custom-source',
      })

      expect(metadata.source).toBe('custom-source')
    })
  })

  describe('createEnvelope', () => {
    it('should create complete envelope with metadata and payload', () => {
      const factory = new EnvelopeFactory()
      const payload = { userId: 'user-1', action: 'created' }

      const envelope = factory.createEnvelope(payload, {
        correlationId: 'corr-123',
        eventType: 'user.created',
        source: 'fiapx.video',
      })

      expect(envelope.metadata).toBeDefined()
      expect(envelope.payload).toEqual(payload)
      expect(envelope.metadata.correlationId).toBe('corr-123')
      expect(envelope.metadata.eventType).toBe('user.created')
    })
  })

  describe('defaultEnvelopeFactory', () => {
    it('should be a singleton instance', () => {
      expect(defaultEnvelopeFactory).toBeInstanceOf(EnvelopeFactory)
    })
  })
})
