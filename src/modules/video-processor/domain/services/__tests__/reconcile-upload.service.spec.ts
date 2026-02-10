import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { ReconcileUploadService } from '../reconcile-upload.service'
import { Video } from '@modules/video-processor/domain/entities/video'
import { VideoMetadataVO } from '@modules/video-processor/domain/value-objects/video-metadata.vo'
import { VideoStatusVO } from '@modules/video-processor/domain/value-objects/video-status.vo'
import { MegabytesValueObject } from '@modules/video-processor/domain/value-objects/megabytes.vo'
import { UniqueEntityID } from '@core/domain/value-objects/unique-entity-id.vo'
import { VideoThirdPartyIntegrationsMetadataVO } from '@modules/video-processor/domain/value-objects/video-third-party-integrations-metadata.vo'
import type { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import type { VideoRepository } from '@modules/video-processor/domain/repositories/video.repository'
import type { DefaultEventBridge } from '@core/events/event-bridge'
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

function makeVideoInStatus(status: string): Video {
  const id = UniqueEntityID.create()
  return Video.createFromDatabase({
    id,
    userId: UniqueEntityID.create(),
    metadata: VideoMetadataVO.create({
      totalSize: MegabytesValueObject.create(50).value,
      durationMs: 60000,
      filename: 'test',
      extension: 'mp4',
    }),
    status: VideoStatusVO.create(status as any),
    parts: [],
    thirdPartyVideoIntegration: VideoThirdPartyIntegrationsMetadataVO.create({
      uploadId: 'upload-123',
      storagePath: 'bucket/path/video.mp4',
      videoId: id.value,
    }),
  })
}

describe('ReconcileUploadService', () => {
  let logger: AbstractLoggerService
  let videoRepository: VideoRepository
  let eventBridge: DefaultEventBridge
  let service: ReconcileUploadService

  beforeEach(() => {
    logger = makeLogger()
    videoRepository = {
      transitionStatus: mock(async () => true),
      findById: mock(),
      createVideo: mock(),
      createVideoParts: mock(),
      updateVideoPart: mock(),
      updateVideo: mock(),
      findByIntegrationId: mock(),
      findByObjectKey: mock(),
      updateTotalSegments: mock(),
      incrementProcessedSegments: mock(),
    } as unknown as VideoRepository
    eventBridge = {
      send: mock(async () => Result.ok({})),
    } as unknown as DefaultEventBridge
    service = new ReconcileUploadService(logger, videoRepository, eventBridge)
  })

  it('should skip when video is already uploaded (idempotent)', async () => {
    const video = makeVideoInStatus('UPLOADED')

    const result = await service.reconcile({
      video,
      correlationId: 'corr-1',
    })

    expect(result.isSuccess).toBe(true)
    expect(result.value.skipped).toBe(true)
    expect(result.value.reason).toBe('already_processed')
  })

  it('should skip when video is in PROCESSING state (idempotent)', async () => {
    const video = makeVideoInStatus('PROCESSING')

    const result = await service.reconcile({
      video,
      correlationId: 'corr-1',
    })

    expect(result.isSuccess).toBe(true)
    expect(result.value.skipped).toBe(true)
    expect(result.value.reason).toBe('already_processed')
  })

  it('should skip when concurrent update is detected', async () => {
    const video = makeVideoInStatus('UPLOADING')
    ;(videoRepository.transitionStatus as any).mockImplementation(
      async () => false,
    )

    const result = await service.reconcile({
      video,
      correlationId: 'corr-1',
    })

    expect(result.isSuccess).toBe(true)
    expect(result.value.skipped).toBe(true)
    expect(result.value.reason).toBe('concurrent_update')
  })

  it('should reconcile successfully and emit events', async () => {
    const video = makeVideoInStatus('UPLOADING')

    const result = await service.reconcile({
      video,
      correlationId: 'corr-1',
      traceId: 'trace-1',
    })

    expect(result.isSuccess).toBe(true)
    expect(result.value.skipped).toBe(false)
    expect(result.value.status).toBe('UPLOADED')
    expect(eventBridge.send).toHaveBeenCalled()
  })

  it('should log error when event emission fails but still succeed', async () => {
    const video = makeVideoInStatus('UPLOADING')
    ;(eventBridge.send as any).mockImplementation(async () =>
      Result.fail(new Error('EventBridge error')),
    )

    const result = await service.reconcile({
      video,
      correlationId: 'corr-1',
    })

    expect(result.isSuccess).toBe(true)
    expect(result.value.skipped).toBe(false)
    expect(logger.error).toHaveBeenCalled()
  })
})
