import { Result } from '@core/domain/result'
import { DefaultEventBridge } from '@core/events/event-bridge'
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import { msToNs } from '@core/libs/logging/log-event'
import { CorrelationStore } from '@core/libs/context'
import { EnvelopeFactory } from '@core/messaging'
import type { Video } from '@modules/video-processor/domain/entities/video'
import type { VideoRepository } from '@modules/video-processor/domain/repositories/video.repository'

const resource = 'ReconcileUploadService'

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
    const startTime = performance.now()
    const { video } = params
    const videoId = video.id.value

    const correlationId = CorrelationStore.correlationId ?? params.correlationId
    const traceId = CorrelationStore.traceId ?? params.traceId

    this.logger.log('Video reconcile started', {
      event: 'video.reconcile.started',
      resource,
      message: 'Starting reconciliation',
      'video.id': videoId,
    })

    if (video.isAlreadyUploaded()) {
      this.logger.log('Video reconcile completed (skipped, idempotent)', {
        event: 'video.reconcile.completed',
        resource,
        message: 'Video already uploaded, skipping',
        status: 'skipped',
        duration: msToNs(performance.now() - startTime),
        'video.id': videoId,
        'video.status': video.status.value,
      })
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
      this.logger.log('Video reconcile completed (skipped, concurrent update)', {
        event: 'video.reconcile.completed',
        resource,
        message: 'Concurrent update detected, skipping',
        status: 'skipped',
        duration: msToNs(performance.now() - startTime),
        'video.id': videoId,
      })
      return Result.ok({
        skipped: true,
        reason: 'concurrent_update',
        videoId,
      })
    }

    const transitionResult = video.completeUpload()
    if (transitionResult.isFailure) {
      this.logger.error('Video reconcile failed (entity transition)', {
        event: 'video.reconcile.completed',
        resource,
        message: 'Failed to transition video status in entity',
        status: 'failure',
        duration: msToNs(performance.now() - startTime),
        error:
          transitionResult.error instanceof Error
            ? {
                message: transitionResult.error.message,
                kind: transitionResult.error.constructor.name,
                stack: transitionResult.error.stack,
              }
            : { message: String(transitionResult.error), kind: 'Error' },
        'video.id': videoId,
      })
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
      const err = failedEvent?.error
      this.logger.error('Video reconcile failed (event emission)', {
        event: 'video.reconcile.completed',
        resource,
        message: 'Failed to emit some events',
        status: 'failure',
        duration: msToNs(performance.now() - startTime),
        error:
          err instanceof Error
            ? {
                message: err.message,
                kind: err.constructor.name,
                stack: err.stack,
              }
            : { message: String(err), kind: 'Error' },
        'video.id': videoId,
      })
    }

    this.logger.log('Video reconcile completed successfully', {
      event: 'video.reconcile.completed',
      resource,
      message: 'Reconciliation completed successfully',
      status: 'success',
      duration: msToNs(performance.now() - startTime),
      'video.id': videoId,
      'video.status': 'UPLOADED',
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
