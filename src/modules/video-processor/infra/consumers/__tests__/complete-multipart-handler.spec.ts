import { PinoLoggerService } from '@core/libs/logging/pino-logger'
import { CompleteMultipartHandler } from '@modules/video-processor/infra/consumers/complete-multipart-handler'
import { ReconcileUploadService } from '@modules/video-processor/domain/services/reconcile-upload.service'
import type { DefaultEventBridge } from '@core/events/event-bridge'
import { SqsUploadReconciler } from '@modules/video-processor/domain/services/sqs-upload-reconciler.service'
import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { context } from '@opentelemetry/api'
import { CorrelationStore } from '@core/libs/context'
import { InMemoryVideoRepository } from '@modules/video-processor/__tests__/factories/in-memory-video.repository'
import { VideoFactory } from '@modules/video-processor/__tests__/factories/video.factory'
import { VideoStatusVO } from '@modules/video-processor/domain/value-objects/video-status.vo'
import { Result } from '@core/domain/result'
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

describe('CompleteMultipartHandler', () => {
  let handler: CompleteMultipartHandler
  let videoRepository: InMemoryVideoRepository
  let mockEventBridge: ReturnType<typeof createMockEventBridge>
  let logger: ReturnType<typeof createLogger>

  const runWithCorrelation = <T>(fn: () => T) =>
    CorrelationStore.run(
      { correlationId: 'test-correlation-id', traceId: 'test-trace-id' },
      fn,
    )

  beforeEach(() => {
    videoRepository = new InMemoryVideoRepository()
    mockEventBridge = createMockEventBridge()
    logger = createLogger()

    const reconcileService = new ReconcileUploadService(
      logger,
      videoRepository,
      mockEventBridge as Pick<
        DefaultEventBridge,
        'send' | 'eventBusName'
      > as DefaultEventBridge,
    )

    const sqsReconciler = new SqsUploadReconciler(
      logger,
      videoRepository,
      reconcileService,
    )

    handler = new CompleteMultipartHandler(logger, sqsReconciler)
  })

  describe('Success scenarios', () => {
    it('should reconcile video when it is uploading', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('UPLOADING'),
      })

      await videoRepository.createVideo(video)

      const result = await runWithCorrelation(() =>
        handler.handle({
          detail: {
            bucket: {
              name: video.thirdPartyVideoIntegration?.bucket || 'test-bucket',
            },
            object: {
              key: video.thirdPartyVideoIntegration?.key || '',
            },
            reason: 'CompleteMultipartUpload',
          },
        }),
      )

      expect(result.isSuccess).toBeTrue()
    })

    it('should update video status to UPLOADED after reconciliation', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('UPLOADING'),
      })

      await videoRepository.createVideo(video)

      await runWithCorrelation(() =>
        handler.handle({
          detail: {
            bucket: {
              name: video.thirdPartyVideoIntegration?.bucket || 'test-bucket',
            },
            object: { key: video.thirdPartyVideoIntegration?.key || '' },
            reason: 'CompleteMultipartUpload',
          },
        }),
      )

      const updatedVideo = await videoRepository.findById(video.id.value)
      expect(updatedVideo.value?.status.value).toBe('UPLOADED')
    })

    it('should reconcile all parts as uploaded', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('UPLOADING'),
      })

      await videoRepository.createVideo(video)

      await runWithCorrelation(() =>
        handler.handle({
          detail: {
            bucket: {
              name: video.thirdPartyVideoIntegration?.bucket || 'test-bucket',
            },
            object: { key: video.thirdPartyVideoIntegration?.key || '' },
            reason: 'CompleteMultipartUpload',
          },
        }),
      )

      const updatedVideo = await videoRepository.findById(video.id.value)
      const allPartsUploaded = updatedVideo.value?.parts.every((p) =>
        p.isUploaded(),
      )
      expect(allPartsUploaded).toBeTrue()
    })

    it('should emit event to EventBridge via SqsReconciler → ReconcileService', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('UPLOADING'),
      })

      await videoRepository.createVideo(video)

      await runWithCorrelation(() =>
        handler.handle({
          detail: {
            bucket: {
              name: video.thirdPartyVideoIntegration?.bucket || 'test-bucket',
            },
            object: { key: video.thirdPartyVideoIntegration?.key || '' },
            reason: 'CompleteMultipartUpload',
          },
        }),
      )

      expect(mockEventBridge.calls.length).toBe(1)
    })
  })

  describe('objectKey forwarding via SqsReconciler', () => {
    it('should find video by objectKey when videoId from S3 path differs from video.id in database', async () => {
      const { video, objectKey } = createVideoWithMismatchedIds()
      await videoRepository.createVideo(video)

      const result = await runWithCorrelation(() =>
        handler.handle({
          detail: {
            bucket: { name: 'test-bucket' },
            object: { key: objectKey },
            reason: 'CompleteMultipartUpload',
          },
        }),
      )

      expect(result.isSuccess).toBeTrue()

      const updatedVideo = await videoRepository.findById(video.id.value)
      expect(updatedVideo.value?.status.value).toBe('UPLOADED')
    })

    it('should emit event when video found by objectKey with mismatched IDs', async () => {
      const { video, objectKey } = createVideoWithMismatchedIds()
      await videoRepository.createVideo(video)

      await runWithCorrelation(() =>
        handler.handle({
          detail: {
            bucket: { name: 'test-bucket' },
            object: { key: objectKey },
            reason: 'CompleteMultipartUpload',
          },
        }),
      )

      expect(mockEventBridge.calls.length).toBe(1)
    })

    it('should skip idempotently when video found by objectKey is already UPLOADED', async () => {
      const { video, objectKey } = createVideoWithMismatchedIds({
        status: VideoStatusVO.create('UPLOADED'),
      })
      await videoRepository.createVideo(video)

      const result = await runWithCorrelation(() =>
        handler.handle({
          detail: {
            bucket: { name: 'test-bucket' },
            object: { key: objectKey },
            reason: 'CompleteMultipartUpload',
          },
        }),
      )

      expect(result.isSuccess).toBeTrue()
      expect(mockEventBridge.calls.length).toBe(0)
    })
  })

  describe('Error scenarios', () => {
    it('should fail when path format is invalid', async () => {
      const result = await runWithCorrelation(() =>
        handler.handle({
          detail: {
            bucket: { name: 'test-bucket' },
            object: { key: 'invalid-key' },
            reason: 'CompleteMultipartUpload',
          },
        }),
      )

      expect(result.isFailure).toBeTrue()
      expect(result.error?.message).toBe('Invalid storage path format')
    })

    it('should fail when key has insufficient path segments', async () => {
      const result = await runWithCorrelation(() =>
        handler.handle({
          detail: {
            bucket: { name: 'test-bucket' },
            object: { key: 'video' },
            reason: 'CompleteMultipartUpload',
          },
        }),
      )

      expect(result.isFailure).toBeTrue()
      expect(result.error?.message).toBe('Invalid storage path format')
    })
  })

  describe('Idempotent behavior (skipped but success)', () => {
    it('should return success when video is not found (idempotent)', async () => {
      const result = await runWithCorrelation(() =>
        handler.handle({
          detail: {
            bucket: { name: 'test-bucket' },
            object: { key: 'video/non-existent-id/file/video.mp4' },
            reason: 'CompleteMultipartUpload',
          },
        }),
      )

      expect(result.isSuccess).toBeTrue()
    })

    it('should return success when video status is already UPLOADED (idempotent)', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('UPLOADED'),
      })

      await videoRepository.createVideo(video)

      const result = await runWithCorrelation(() =>
        handler.handle({
          detail: {
            bucket: {
              name: video.thirdPartyVideoIntegration?.bucket || 'test-bucket',
            },
            object: { key: video.thirdPartyVideoIntegration?.key || '' },
            reason: 'CompleteMultipartUpload',
          },
        }),
      )

      expect(result.isSuccess).toBeTrue()
      expect(mockEventBridge.calls.length).toBe(0)
    })

    it('should return success when video status is PROCESSING (idempotent)', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('PROCESSING'),
      })

      await videoRepository.createVideo(video)

      const result = await runWithCorrelation(() =>
        handler.handle({
          detail: {
            bucket: {
              name: video.thirdPartyVideoIntegration?.bucket || 'test-bucket',
            },
            object: { key: video.thirdPartyVideoIntegration?.key || '' },
            reason: 'CompleteMultipartUpload',
          },
        }),
      )

      expect(result.isSuccess).toBeTrue()
      expect(mockEventBridge.calls.length).toBe(0)
    })

    it('should return success when video status is COMPLETED (idempotent)', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('COMPLETED'),
      })

      await videoRepository.createVideo(video)

      const result = await runWithCorrelation(() =>
        handler.handle({
          detail: {
            bucket: {
              name: video.thirdPartyVideoIntegration?.bucket || 'test-bucket',
            },
            object: { key: video.thirdPartyVideoIntegration?.key || '' },
            reason: 'CompleteMultipartUpload',
          },
        }),
      )

      expect(result.isSuccess).toBeTrue()
    })

    it('should return success when video status transition would be invalid (CREATED -> UPLOADED)', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('CREATED'),
      })

      await videoRepository.createVideo(video)

      const result = await runWithCorrelation(() =>
        handler.handle({
          detail: {
            bucket: {
              name: video.thirdPartyVideoIntegration?.bucket || 'test-bucket',
            },
            object: { key: video.thirdPartyVideoIntegration?.key || '' },
            reason: 'CompleteMultipartUpload',
          },
        }),
      )

      expect(result.isSuccess).toBeTrue()
    })
  })
})
