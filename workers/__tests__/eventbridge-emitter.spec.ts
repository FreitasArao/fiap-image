import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mockClient } from 'aws-sdk-client-mock'
import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge'
import { EventBridgeEmitter } from '@workers/adapters/eventbridge-emitter'
import type { VideoStatusChangedEvent } from '@core/abstractions/messaging'

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

  describe('emitVideoStatusChanged', () => {
    it('should emit event with required fields', async () => {
      eventBridgeMock.on(PutEventsCommand).resolves({})

      const event: VideoStatusChangedEvent = {
        videoId: 'video-123',
        status: 'COMPLETED',
        correlationId: 'corr-123',
      }

      await emitter.emitVideoStatusChanged(event)

      const calls = eventBridgeMock.commandCalls(PutEventsCommand)
      expect(calls.length).toBe(1)

      const entry = calls[0].args[0].input.Entries?.[0]
      expect(entry?.Source).toBe('fiapx.video')
      expect(entry?.DetailType).toBe('Video Status Changed')

      const detail = JSON.parse(entry?.Detail ?? '{}')
      expect(detail.videoId).toBe('video-123')
      expect(detail.status).toBe('COMPLETED')
      expect(detail.correlationId).toBe('corr-123')
      expect(detail.timestamp).toBeDefined()
    })

    it('should emit PROCESSING status', async () => {
      eventBridgeMock.on(PutEventsCommand).resolves({})

      await emitter.emitVideoStatusChanged({
        videoId: 'video-123',
        status: 'PROCESSING',
        correlationId: 'corr-123',
      })

      const calls = eventBridgeMock.commandCalls(PutEventsCommand)
      const detail = JSON.parse(
        calls[0].args[0].input.Entries?.[0]?.Detail ?? '{}',
      )
      expect(detail.status).toBe('PROCESSING')
    })

    it('should emit FAILED status with errorReason', async () => {
      eventBridgeMock.on(PutEventsCommand).resolves({})

      await emitter.emitVideoStatusChanged({
        videoId: 'video-123',
        status: 'FAILED',
        correlationId: 'corr-123',
        errorReason: 'Video file not found',
      })

      const calls = eventBridgeMock.commandCalls(PutEventsCommand)
      const detail = JSON.parse(
        calls[0].args[0].input.Entries?.[0]?.Detail ?? '{}',
      )
      expect(detail.status).toBe('FAILED')
      expect(detail.errorReason).toBe('Video file not found')
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

      await emitter.emitVideoStatusChanged(event)

      const calls = eventBridgeMock.commandCalls(PutEventsCommand)
      const detail = JSON.parse(
        calls[0].args[0].input.Entries?.[0]?.Detail ?? '{}',
      )

      expect(detail.userEmail).toBe('user@example.com')
      expect(detail.videoName).toBe('my-video.mp4')
      expect(detail.videoPath).toBe('bucket/video/123/file/video.mp4')
      expect(detail.duration).toBe(120000)
      expect(detail.downloadUrl).toBe('https://example.com/download/video.zip')
      expect(detail.traceId).toBe('trace-abc')
      expect(detail.timestamp).toBe('2024-01-15T10:30:00.000Z')
    })

    it('should use current timestamp when not provided', async () => {
      eventBridgeMock.on(PutEventsCommand).resolves({})

      const before = new Date().toISOString()

      await emitter.emitVideoStatusChanged({
        videoId: 'video-123',
        status: 'COMPLETED',
        correlationId: 'corr-123',
      })

      const after = new Date().toISOString()

      const calls = eventBridgeMock.commandCalls(PutEventsCommand)
      const detail = JSON.parse(
        calls[0].args[0].input.Entries?.[0]?.Detail ?? '{}',
      )

      expect(detail.timestamp >= before).toBe(true)
      expect(detail.timestamp <= after).toBe(true)
    })
  })
})
