import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { context } from '@opentelemetry/api'
import { PinoLoggerService } from '@core/libs/logging/pino-logger'
import { Result } from '@core/domain/result'
import { SqsUploadReconciler } from '../sqs-upload-reconciler.service'
import { ReconcileUploadService } from '../reconcile-upload.service'
import { InMemoryVideoRepository } from '@modules/video-processor/__tests__/factories/in-memory-video.repository'
import { VideoFactory } from '@modules/video-processor/__tests__/factories/video.factory'
import { VideoStatusVO } from '@modules/video-processor/domain/value-objects/video-status.vo'
import { Video } from '@modules/video-processor/domain/entities/video'
import { UniqueEntityID } from '@core/domain/value-objects/unique-entity-id.vo'
import { VideoMetadataVO } from '@modules/video-processor/domain/value-objects/video-metadata.vo'
import { MegabytesValueObject } from '@modules/video-processor/domain/value-objects/megabytes.vo'
import { ThirdPartyIntegration } from '@modules/video-processor/domain/entities/third-party-integration.vo'
import { VideoThirdPartyIntegrationsMetadataVO } from '@modules/video-processor/domain/value-objects/video-third-party-integrations-metadata.vo'

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

/**
 * Creates a video entity where the database video_id differs from the S3 path ID.
 * This simulates a real production scenario: S3 stores files at a path that includes
 * an ID that may differ from the actual video_id in Cassandra.
 */
function createVideoWithMismatchedIds(
  overrides: { status?: VideoStatusVO } = {},
) {
  const realDbId = UniqueEntityID.create()
  const s3PathId = UniqueEntityID.create()
  const objectKey = `video/${s3PathId.value}/file/test-video.mp4`
  const storagePath = `test-bucket/${objectKey}`

  const video = Video.createFromDatabase({
    id: realDbId,
    userId: UniqueEntityID.create(),
    metadata: VideoMetadataVO.create({
      totalSize: MegabytesValueObject.create(50).value,
      durationMs: 60000,
      filename: 'test-video',
      extension: 'mp4',
    }),
    status: overrides.status ?? VideoStatusVO.create('UPLOADING'),
    parts: [],
    integration: ThirdPartyIntegration.create(),
    thirdPartyVideoIntegration: VideoThirdPartyIntegrationsMetadataVO.create({
      uploadId: 'upload-123',
      storagePath,
      videoId: realDbId.value,
    }),
  })

  return { video, realDbId, s3PathId, objectKey }
}

describe('SqsUploadReconciler', () => {
  let sqsReconciler: SqsUploadReconciler
  let reconcileService: ReconcileUploadService
  let videoRepository: InMemoryVideoRepository
  let mockEventBridge: ReturnType<typeof createMockEventBridge>

  beforeEach(() => {
    videoRepository = new InMemoryVideoRepository()
    mockEventBridge = createMockEventBridge()
    const logger = createLogger()

    reconcileService = new ReconcileUploadService(
      logger,
      videoRepository,
      mockEventBridge as unknown as Parameters<
        typeof ReconcileUploadService.prototype.reconcile
      >[0] extends { eventBridge: infer E }
        ? E
        : never,
    )

    sqsReconciler = new SqsUploadReconciler(
      logger,
      videoRepository,
      reconcileService,
    )
  })

  describe('Video lookup by objectKey', () => {
    it('should find video by objectKey', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('UPLOADING'),
      })
      await videoRepository.createVideo(video)
      const objectKey = video.thirdPartyVideoIntegration?.key || ''

      const result = await sqsReconciler.execute({
        videoId: video.id.value,
        objectKey,
        correlationId: 'test-correlation-id',
      })

      expect(result.isSuccess).toBeTrue()
      expect(result.value.skipped).toBeFalse()
      expect(result.value.status).toBe('UPLOADED')
    })

    it('should find video by objectKey even when videoId from S3 path differs', async () => {
      const { video, s3PathId, objectKey } = createVideoWithMismatchedIds()
      await videoRepository.createVideo(video)

      const result = await sqsReconciler.execute({
        videoId: s3PathId.value,
        objectKey,
        correlationId: 'test-correlation-id',
      })

      expect(result.isSuccess).toBeTrue()
      expect(result.value.skipped).toBeFalse()
      expect(result.value.status).toBe('UPLOADED')
      // Result should contain the real DB video ID, not the S3 path ID
      expect(result.value.videoId).toBe(video.id.value)
      expect(result.value.videoId).not.toBe(s3PathId.value)
    })

    it('should return video_not_found when objectKey matches no video', async () => {
      const result = await sqsReconciler.execute({
        videoId: 'some-id',
        objectKey: 'video/non-existent/file/video.mp4',
        correlationId: 'test-correlation-id',
      })

      expect(result.isSuccess).toBeTrue()
      expect(result.value.skipped).toBeTrue()
      expect(result.value.reason).toBe('video_not_found')
    })
  })

  describe('Parts reconciliation', () => {
    it('should reconcile all parts as uploaded before delegating to core', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('UPLOADING'),
      })
      await videoRepository.createVideo(video)
      const objectKey = video.thirdPartyVideoIntegration?.key || ''

      await sqsReconciler.execute({
        videoId: video.id.value,
        objectKey,
        correlationId: 'test-correlation-id',
      })

      // All parts should be marked as uploaded
      const updatedVideo = await videoRepository.findById(video.id.value)
      const allPartsUploaded = updatedVideo.value?.parts.every((p) =>
        p.isUploaded(),
      )
      expect(allPartsUploaded).toBeTrue()
    })

    it('should persist reconciled parts in database after successful transition', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('UPLOADING'),
      })
      await videoRepository.createVideo(video)
      const objectKey = video.thirdPartyVideoIntegration?.key || ''

      await sqsReconciler.execute({
        videoId: video.id.value,
        objectKey,
        correlationId: 'test-correlation-id',
      })

      // Video status should be UPLOADED in the repository
      const updatedVideo = await videoRepository.findById(video.id.value)
      expect(updatedVideo.value?.status.value).toBe('UPLOADED')
    })

    it('should NOT persist reconciled parts when transition is skipped', async () => {
      const { video, objectKey } = createVideoWithMismatchedIds({
        status: VideoStatusVO.create('UPLOADED'),
      })
      await videoRepository.createVideo(video)

      const result = await sqsReconciler.execute({
        videoId: video.id.value,
        objectKey,
        correlationId: 'test-correlation-id',
      })

      expect(result.value.skipped).toBeTrue()
      expect(result.value.reason).toBe('already_processed')
    })
  })

  describe('Delegation to core ReconcileUploadService', () => {
    it('should emit event to EventBridge via core service', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('UPLOADING'),
      })
      await videoRepository.createVideo(video)
      const objectKey = video.thirdPartyVideoIntegration?.key || ''

      await sqsReconciler.execute({
        videoId: video.id.value,
        objectKey,
        correlationId: 'test-correlation-id',
      })

      expect(mockEventBridge.calls.length).toBe(1)
    })

    it('should not emit event when video is already processed', async () => {
      const { video, objectKey } = createVideoWithMismatchedIds({
        status: VideoStatusVO.create('UPLOADED'),
      })
      await videoRepository.createVideo(video)

      await sqsReconciler.execute({
        videoId: video.id.value,
        objectKey,
        correlationId: 'test-correlation-id',
      })

      expect(mockEventBridge.calls.length).toBe(0)
    })
  })

  describe('Idempotent behavior', () => {
    it('should skip already_processed when video found by objectKey is UPLOADED', async () => {
      const { video, s3PathId, objectKey } = createVideoWithMismatchedIds({
        status: VideoStatusVO.create('UPLOADED'),
      })
      await videoRepository.createVideo(video)

      const result = await sqsReconciler.execute({
        videoId: s3PathId.value,
        objectKey,
        correlationId: 'test-correlation-id',
      })

      expect(result.isSuccess).toBeTrue()
      expect(result.value.skipped).toBeTrue()
      expect(result.value.reason).toBe('already_processed')
      expect(result.value.videoId).toBe(video.id.value)
    })

    it('should not emit duplicate events on concurrent calls', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('UPLOADING'),
      })
      await videoRepository.createVideo(video)
      const objectKey = video.thirdPartyVideoIntegration?.key || ''

      const [result1, result2] = await Promise.all([
        sqsReconciler.execute({
          videoId: video.id.value,
          objectKey,
          correlationId: 'correlation-1',
        }),
        sqsReconciler.execute({
          videoId: video.id.value,
          objectKey,
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

  describe('resolvedVideoId consistency', () => {
    it('should use real DB videoId for status transition even when S3 path ID differs', async () => {
      const { video, s3PathId, objectKey } = createVideoWithMismatchedIds()
      await videoRepository.createVideo(video)

      await sqsReconciler.execute({
        videoId: s3PathId.value,
        objectKey,
        correlationId: 'test-correlation-id',
      })

      // Verify the video status was transitioned using the real DB ID
      const updatedVideo = await videoRepository.findById(video.id.value)
      expect(updatedVideo.value?.status.value).toBe('UPLOADED')
    })
  })
})
