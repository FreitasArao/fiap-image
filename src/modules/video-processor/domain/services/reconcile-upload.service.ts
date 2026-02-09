import { Result } from '@core/domain/result'
import { DefaultEventBridge } from '@core/events/event-bridge'
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import { CorrelationStore } from '@core/libs/context'
import { EnvelopeFactory } from '@core/messaging'
import type { Video } from '@modules/video-processor/domain/entities/video'
import type { VideoRepository } from '@modules/video-processor/domain/repositories/video.repository'

export type ReconcileParams = {
  video: Video
  correlationId: string
  traceId?: string
}

export type ReconcileResult = {
  skipped: boolean
  reason?: 'already_processed' | 'concurrent_update'
  videoId: string
  status?: string
}

/**
 * ReconcileUploadService - Core domain service for idempotent status transition.
 *
 * Single Responsibility: Given a Video entity (already found by the caller),
 * this service performs:
 * 1. Idempotency check (skip if already processed)
 * 2. Conditional status transition (UPLOADING → UPLOADED)
 * 3. Domain entity transition + event emission to EventBridge
 *
 * It does NOT handle:
 * - Video lookup (caller's responsibility)
 * - Parts reconciliation (SqsUploadReconciler's responsibility)
 * - Source-specific logic
 */
export class ReconcileUploadService {
  constructor(
    private readonly logger: AbstractLoggerService,
    private readonly videoRepository: VideoRepository,
    private readonly eventBridge: DefaultEventBridge,
  ) {}

  async reconcile(
    params: ReconcileParams,
  ): Promise<Result<ReconcileResult, Error>> {
    const { video } = params
    const videoId = video.id.value

    const correlationId = CorrelationStore.correlationId ?? params.correlationId
    const traceId = CorrelationStore.traceId ?? params.traceId

    this.logger.log(`[ReconcileUpload] Starting reconciliation`, { videoId })

    if (video.isAlreadyUploaded()) {
      this.logger.log(
        `[ReconcileUpload] Video already uploaded, skipping (idempotent)`,
        {
          videoId,
          currentStatus: video.status.value,
        },
      )
      return Result.ok({
        skipped: true,
        reason: 'already_processed',
        videoId,
        status: video.status.value,
      })
    }

    const transitioned = await this.videoRepository.transitionStatus(
      videoId,
      'UPLOADING',
      'UPLOADED',
    )

    if (!transitioned) {
      this.logger.log(
        `[ReconcileUpload] Concurrent update detected, skipping`,
        { videoId },
      )
      return Result.ok({
        skipped: true,
        reason: 'concurrent_update',
        videoId,
      })
    }

    const transitionResult = video.completeUpload()
    if (transitionResult.isFailure) {
      this.logger.error(
        `[ReconcileUpload] Failed to transition video status in entity`,
        {
          videoId,
          error: transitionResult.error,
        },
      )
    }

    const events = video.domainEvents
    const eventResults = await this.emitDomainEvents(
      events,
      video,
      correlationId,
      traceId,
    )

    if (eventResults.some((r) => r.isFailure)) {
      const failedEvent = eventResults.find((r) => r.isFailure)
      this.logger.error(`[ReconcileUpload] Failed to emit some events`, {
        videoId,
        error: failedEvent?.error,
      })
    }

    this.logger.log(`[ReconcileUpload] Reconciliation completed successfully`, {
      videoId,
      eventsEmitted: events.length,
    })

    return Result.ok({
      skipped: false,
      videoId,
      status: 'UPLOADED',
    })
  }

  private async emitDomainEvents(
    events: readonly { eventName: string }[],
    video: Video,
    correlationId: string,
    traceId?: string,
  ): Promise<Result<unknown, Error>[]> {
    const envelopeFactory = new EnvelopeFactory()

    return Promise.all(
      events.map((_event) =>
        this.eventBridge.send(
          envelopeFactory.createEnvelope(
            {
              videoId: video.id.value,
              videoPath:
                video.thirdPartyVideoIntegration?.path ?? video.id.value,
              status: 'UPLOADED',
              duration: video.metadata.durationMs,
              videoName: video.metadata.fullFilename,
              timestamp: new Date().toISOString(),
            },
            {
              correlationId,
              source: 'fiapx.video',
              eventType: 'Video Status Changed',
              traceId: traceId ?? crypto.randomUUID(),
            },
          ),
        ),
      ),
    )
  }
}
