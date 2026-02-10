import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mockClient } from 'aws-sdk-client-mock'
import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge'
import { EventBridgeEmitter } from '@workers/adapters/eventbridge-emitter'
import type { VideoStatusChangedEvent } from '@core/abstractions/messaging'
import { CorrelationStore } from '@core/libs/context'

const eventBridgeMock = mockClient(EventBridgeClient)

describe('EventBridgeEmitter', () => {
  let emitter: EventBridgeEmitter
  let client: EventBridgeClient

  beforeEach(() => {
    eventBridgeMock.reset()
    client = new EventBridgeClient({})
    emitter = new EventBridgeEmitter(client)
  })

  afterEach(() => {
    eventBridgeMock.reset()
  })

  /**
   * Helper: parse the envelope from the PutEventsCommand Detail field.
   * The emitter now wraps event data in an envelope: { metadata, payload }.
   */
  function getEnvelopeFromCall(callIndex = 0) {
    const calls = eventBridgeMock.commandCalls(PutEventsCommand)
    const entry = calls[callIndex].args[0].input.Entries?.[0]
    const envelope = JSON.parse(entry?.Detail ?? '{}')
    return {
      entry,
      envelope,
      payload: envelope.payload,
      metadata: envelope.metadata,
    }
  }

  describe('emitVideoStatusChanged', () => {
    it('should emit event with required fields', async () => {
      eventBridgeMock.on(PutEventsCommand).resolves({})

      const event: VideoStatusChangedEvent = {
        videoId: 'video-123',
        status: 'COMPLETED',
        correlationId: 'corr-123',
      }

      await CorrelationStore.run(
        { correlationId: 'corr-123', traceId: 'trace-123' },
        () => emitter.emitVideoStatusChanged(event),
      )

      const calls = eventBridgeMock.commandCalls(PutEventsCommand)
      expect(calls.length).toBe(1)

      const { entry, payload, metadata } = getEnvelopeFromCall()
      expect(entry?.Source).toBe('fiapx.video')
      expect(entry?.DetailType).toBe('Video Status Changed')

      expect(payload.videoId).toBe('video-123')
      expect(payload.status).toBe('COMPLETED')
      expect(payload.correlationId).toBe('corr-123')
      expect(payload.timestamp).toBeDefined()
      expect(metadata.correlationId).toBe('corr-123')
    })

    it('should emit PROCESSING status', async () => {
      eventBridgeMock.on(PutEventsCommand).resolves({})

      await CorrelationStore.run({ correlationId: 'corr-123' }, () =>
        emitter.emitVideoStatusChanged({
          videoId: 'video-123',
          status: 'PROCESSING',
          correlationId: 'corr-123',
        }),
      )

      const { payload } = getEnvelopeFromCall()
      expect(payload.status).toBe('PROCESSING')
    })

    it('should emit FAILED status with errorReason', async () => {
      eventBridgeMock.on(PutEventsCommand).resolves({})

      await CorrelationStore.run({ correlationId: 'corr-123' }, () =>
        emitter.emitVideoStatusChanged({
          videoId: 'video-123',
          status: 'FAILED',
          correlationId: 'corr-123',
          errorReason: 'Video file not found',
        }),
      )

      const { payload } = getEnvelopeFromCall()
      expect(payload.status).toBe('FAILED')
      expect(payload.errorReason).toBe('Video file not found')
    })

    it('should include all optional fields when provided', async () => {
      eventBridgeMock.on(PutEventsCommand).resolves({})

      const event: VideoStatusChangedEvent = {
        videoId: 'video-123',
        status: 'COMPLETED',
        correlationId: 'corr-123',
        timestamp: '2024-01-15T10:30:00.000Z',
        userEmail: 'user@example.com',
        videoName: 'my-video.mp4',
        videoPath: 'bucket/video/123/file/video.mp4',
        duration: 120000,
        downloadUrl: 'https://example.com/download/video.zip',
        traceId: 'trace-abc',
      }

      await CorrelationStore.run(
        { correlationId: 'corr-123', traceId: 'trace-abc' },
        () => emitter.emitVideoStatusChanged(event),
      )

      const { payload, metadata } = getEnvelopeFromCall()

      expect(payload.userEmail).toBe('user@example.com')
      expect(payload.videoName).toBe('my-video.mp4')
      expect(payload.videoPath).toBe('bucket/video/123/file/video.mp4')
      expect(payload.duration).toBe(120000)
      expect(payload.downloadUrl).toBe('https://example.com/download/video.zip')
      expect(payload.timestamp).toBe('2024-01-15T10:30:00.000Z')
      expect(metadata.traceId).toBe('trace-abc')
    })

    it('should use current timestamp when not provided', async () => {
      eventBridgeMock.on(PutEventsCommand).resolves({})

      const before = new Date().toISOString()

      await CorrelationStore.run({ correlationId: 'corr-123' }, () =>
        emitter.emitVideoStatusChanged({
          videoId: 'video-123',
          status: 'COMPLETED',
          correlationId: 'corr-123',
        }),
      )

      const after = new Date().toISOString()

      const { payload } = getEnvelopeFromCall()

      expect(payload.timestamp >= before).toBe(true)
      expect(payload.timestamp <= after).toBe(true)
    })
  })
})
