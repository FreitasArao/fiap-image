import { describe, it, expect, beforeEach, mock } from 'bun:test'

type MockFn = ReturnType<typeof mock>
import { SqsUploadReconciler } from '../sqs-upload-reconciler.service'
import { ReconcileUploadService } from '../reconcile-upload.service'
import { Video } from '@modules/video-processor/domain/entities/video'
import { VideoMetadataVO } from '@modules/video-processor/domain/value-objects/video-metadata.vo'
import { VideoStatusVO } from '@modules/video-processor/domain/value-objects/video-status.vo'
import { MegabytesValueObject } from '@modules/video-processor/domain/value-objects/megabytes.vo'
import { UniqueEntityID } from '@core/domain/value-objects/unique-entity-id.vo'
import { VideoThirdPartyIntegrationsMetadataVO } from '@modules/video-processor/domain/value-objects/video-third-party-integrations-metadata.vo'
import { VideoPart } from '@modules/video-processor/domain/entities/video-part'
import { ThirdPartyIntegration } from '@modules/video-processor/domain/entities/third-party-integration.vo'
import type { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import type { VideoRepository } from '@modules/video-processor/domain/repositories/video.repository'
import { Result } from '@core/domain/result'

function makeLogger(): AbstractLoggerService {
  return {
    log: mock(),
    error: mock(),
    warn: mock(),
    debug: mock(),
    verbose: mock(),
    withContext: mock(),
    context: undefined,
  } as unknown as AbstractLoggerService
}

function makeVideo(): Video {
  const id = UniqueEntityID.create()
  const video = Video.createFromDatabase({
    id,
    userId: UniqueEntityID.create(),
    metadata: VideoMetadataVO.create({
      totalSize: MegabytesValueObject.create(50).value,
      durationMs: 60000,
      filename: 'test',
      extension: 'mp4',
    }),
    status: VideoStatusVO.create('UPLOADING'),
    parts: [],
    thirdPartyVideoIntegration: VideoThirdPartyIntegrationsMetadataVO.create({
      uploadId: 'upload-123',
      storagePath: 'bucket/video/key.mp4',
      videoId: id.value,
    }),
  })

  // Add a pending part
  video.addPart(
    VideoPart.create({
      videoId: video.id,
      partNumber: 1,
      size: 1024,
      integration: ThirdPartyIntegration.create(),
      url: 'http://url',
    }),
  )

  return video
}

describe('SqsUploadReconciler', () => {
  let logger: AbstractLoggerService
  let videoRepository: VideoRepository
  let reconcileService: ReconcileUploadService
  let reconciler: SqsUploadReconciler

  beforeEach(() => {
    logger = makeLogger()
    videoRepository = {
      findByObjectKey: mock(async () => Result.ok(makeVideo())),
      updateVideoPart: mock(async () => Result.ok(undefined)),
      transitionStatus: mock(async () => true),
      findById: mock(),
      createVideo: mock(),
      createVideoParts: mock(),
      updateVideo: mock(),
      findByIntegrationId: mock(),
      updateTotalSegments: mock(),
      incrementProcessedSegments: mock(),
    } as unknown as VideoRepository
    reconcileService = {
      reconcile: mock(async () =>
        Result.ok({ skipped: false, videoId: 'vid-1', status: 'UPLOADED' }),
      ),
    } as unknown as ReconcileUploadService
    reconciler = new SqsUploadReconciler(
      logger,
      videoRepository,
      reconcileService,
    )
  })

  it('should return video_not_found when no video matches objectKey', async () => {
    ;(videoRepository.findByObjectKey as MockFn).mockImplementation(async () =>
      Result.ok(null),
    )

    const result = await reconciler.execute({
      videoId: 'vid-1',
      objectKey: 'unknown-key',
      correlationId: 'corr-1',
    })

    expect(result.isSuccess).toBe(true)
    expect(result.value.skipped).toBe(true)
    expect(result.value.reason).toBe('video_not_found')
  })

  it('should propagate repository failure', async () => {
    ;(videoRepository.findByObjectKey as MockFn).mockImplementation(async () =>
      Result.fail(new Error('DB error')),
    )

    const result = await reconciler.execute({
      videoId: 'vid-1',
      objectKey: 'key-1',
      correlationId: 'corr-1',
    })

    expect(result.isFailure).toBe(true)
    expect(result.error.message).toBe('DB error')
  })

  it('should reconcile parts and persist when not skipped', async () => {
    const result = await reconciler.execute({
      videoId: 'vid-1',
      objectKey: 'key-1',
      correlationId: 'corr-1',
      traceId: 'trace-1',
    })

    expect(result.isSuccess).toBe(true)
    expect(result.value.skipped).toBe(false)
    expect(videoRepository.updateVideoPart).toHaveBeenCalled()
    expect(reconcileService.reconcile).toHaveBeenCalled()
  })

  it('should not persist parts when reconciliation is skipped', async () => {
    ;(reconcileService.reconcile as MockFn).mockImplementation(async () =>
      Result.ok({
        skipped: true,
        reason: 'already_processed',
        videoId: 'vid-1',
      }),
    )

    const result = await reconciler.execute({
      videoId: 'vid-1',
      objectKey: 'key-1',
      correlationId: 'corr-1',
    })

    expect(result.isSuccess).toBe(true)
    expect(result.value.skipped).toBe(true)
    expect(videoRepository.updateVideoPart).not.toHaveBeenCalled()
  })

  it('should propagate reconcile service failure', async () => {
    ;(reconcileService.reconcile as MockFn).mockImplementation(async () =>
      Result.fail(new Error('reconcile failed')),
    )

    const result = await reconciler.execute({
      videoId: 'vid-1',
      objectKey: 'key-1',
      correlationId: 'corr-1',
    })

    expect(result.isFailure).toBe(true)
    expect(result.error.message).toBe('reconcile failed')
  })
})
