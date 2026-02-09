import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { context } from '@opentelemetry/api'
import { PinoLoggerService } from '@core/libs/logging/pino-logger'
import { Result } from '@core/domain/result'
import { ReconcileUploadService } from '../reconcile-upload.service'
import { InMemoryVideoRepository } from '@modules/video-processor/__tests__/factories/in-memory-video.repository'
import { VideoFactory } from '@modules/video-processor/__tests__/factories/video.factory'
import { VideoStatusVO } from '@modules/video-processor/domain/value-objects/video-status.vo'

function createMockEventBridge() {
  const calls: unknown[] = []
  return {
    calls,
    eventBusName: 'test-bus',
    send: mock(async () => {
      calls.push({ sent: true })
      return Result.ok({ FailedEntryCount: 0 })
    }),
  }
}

function createLogger() {
  return new PinoLoggerService({ suppressConsole: true }, context.active())
}

describe('ReconcileUploadService', () => {
  let service: ReconcileUploadService
  let videoRepository: InMemoryVideoRepository
  let mockEventBridge: ReturnType<typeof createMockEventBridge>

  beforeEach(() => {
    videoRepository = new InMemoryVideoRepository()
    mockEventBridge = createMockEventBridge()
    service = new ReconcileUploadService(
      createLogger(),
      videoRepository,
      mockEventBridge as unknown as Parameters<
        typeof ReconcileUploadService.prototype.reconcile
      >[0] extends { eventBridge: infer E }
        ? E
        : never,
    )
  })

  describe('Idempotent Receiver Pattern', () => {
    it('should transition UPLOADING video to UPLOADED', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('UPLOADING'),
      })
      await videoRepository.createVideo(video)

      const result = await service.reconcile({
        video,
        correlationId: 'test-correlation-id',
      })

      expect(result.isSuccess).toBeTrue()
      expect(result.value.skipped).toBeFalse()
      expect(result.value.status).toBe('UPLOADED')
      expect(result.value.videoId).toBe(video.id.value)
    })

    it('should skip when video is already UPLOADED', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('UPLOADED'),
      })
      await videoRepository.createVideo(video)

      const result = await service.reconcile({
        video,
        correlationId: 'test-correlation-id',
      })

      expect(result.isSuccess).toBeTrue()
      expect(result.value.skipped).toBeTrue()
      expect(result.value.reason).toBe('already_processed')
    })

    it('should skip when video is PROCESSING', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('PROCESSING'),
      })
      await videoRepository.createVideo(video)

      const result = await service.reconcile({
        video,
        correlationId: 'test-correlation-id',
      })

      expect(result.isSuccess).toBeTrue()
      expect(result.value.skipped).toBeTrue()
      expect(result.value.reason).toBe('already_processed')
    })
  })

  describe('Concurrent Update Detection', () => {
    it('should detect concurrent update when status does not match', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('CREATED'),
      })
      await videoRepository.createVideo(video)

      const result = await service.reconcile({
        video,
        correlationId: 'test-correlation-id',
      })

      expect(result.isSuccess).toBeTrue()
      expect(result.value.skipped).toBeTrue()
      expect(result.value.reason).toBe('concurrent_update')
    })

    it('should not emit duplicate events on concurrent calls', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('UPLOADING'),
      })
      await videoRepository.createVideo(video)

      const [result1, result2] = await Promise.all([
        service.reconcile({
          video,
          correlationId: 'correlation-1',
        }),
        service.reconcile({
          video,
          correlationId: 'correlation-2',
        }),
      ])

      expect(result1.isSuccess).toBeTrue()
      expect(result2.isSuccess).toBeTrue()

      const skippedCount = [
        result1.value.skipped,
        result2.value.skipped,
      ].filter(Boolean).length

      expect(skippedCount).toBeGreaterThanOrEqual(1)
      expect(mockEventBridge.calls.length).toBeLessThanOrEqual(1)
    })
  })

  describe('Event Emission', () => {
    it('should emit event to EventBridge when processing succeeds', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('UPLOADING'),
      })
      await videoRepository.createVideo(video)

      await service.reconcile({
        video,
        correlationId: 'test-correlation-id',
      })

      expect(mockEventBridge.calls.length).toBe(1)
    })

    it('should not emit event when video is already processed', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('UPLOADED'),
      })
      await videoRepository.createVideo(video)

      await service.reconcile({
        video,
        correlationId: 'test-correlation-id',
      })

      expect(mockEventBridge.calls.length).toBe(0)
    })

    it('should not emit event when concurrent update is detected', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('CREATED'),
      })
      await videoRepository.createVideo(video)

      await service.reconcile({
        video,
        correlationId: 'test-correlation-id',
      })

      expect(mockEventBridge.calls.length).toBe(0)
    })
  })

  describe('VideoId consistency', () => {
    it('should always return video.id.value as videoId in the result', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('UPLOADING'),
      })
      await videoRepository.createVideo(video)

      const result = await service.reconcile({
        video,
        correlationId: 'test-correlation-id',
      })

      expect(result.value.videoId).toBe(video.id.value)
    })
  })
})
