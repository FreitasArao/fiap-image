import { Result } from '@core/domain/result'
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import { CorrelationStore } from '@core/libs/context'
import {
  createStoragePathBuilder,
  StoragePathBuilder,
} from '@modules/video-processor/infra/services/storage'
import { SqsUploadReconciler } from '@modules/video-processor/domain/services/sqs-upload-reconciler.service'

export type CompleteMultipartEvent = {
  detail: {
    bucket: {
      name: string
    }
    object: {
      key: string
    }
    reason: string
  }
}

/**
 * CompleteMultipartHandler - Handles S3 CompleteMultipartUpload events from SQS.
 *
 * This handler is responsible for:
 * 1. Parsing the S3 event to extract the video ID and object key
 * 2. Delegating the SQS-specific reconciliation to SqsUploadReconciler
 *
 * The SqsUploadReconciler handles finding the video by objectKey, reconciling parts,
 * and delegating to ReconcileUploadService for idempotent status transition.
 */
export class CompleteMultipartHandler {
  private readonly pathBuilder: StoragePathBuilder

  constructor(
    private readonly logger: AbstractLoggerService,
    private readonly sqsReconciler: SqsUploadReconciler,
  ) {
    this.pathBuilder = createStoragePathBuilder()
  }

  async handle(event: CompleteMultipartEvent): Promise<Result<void, Error>> {
    const { key } = event.detail.object
    const { name: bucket } = event.detail.bucket

    // correlationId is obtained implicitly from CorrelationStore (set by SQS consumer)
    // Fallback to a new UUID only if no context exists
    const correlationId = CorrelationStore.correlationId ?? crypto.randomUUID()

    // correlationId is automatically included in logs via Pino mixin
    this.logger.log('Received S3 CompleteMultipartUpload event', {
      key,
      bucket,
    })

    // 1. Parse the storage path to extract videoId
    const fullPath = `${bucket}/${key}`
    const parsed = this.pathBuilder.parse(fullPath)

    if (!parsed) {
      this.logger.error('Invalid storage path format', {
        key,
        fullPath,
        event: JSON.stringify(event),
      })
      return Result.fail(new Error('Invalid storage path format'))
    }

    const { videoId } = parsed

    const reconcileResult = await this.sqsReconciler.execute({
      videoId,
      objectKey: key,
      correlationId,
    })

    if (reconcileResult.isFailure) {
      this.logger.error('Reconciliation failed', {
        videoId,
        error: reconcileResult.error,
      })
      return Result.fail(reconcileResult.error)
    }

    const result = reconcileResult.value

    if (result.skipped) {
      this.logger.log('Reconciliation skipped (idempotent)', {
        videoId,
        reason: result.reason,
      })
      // Return success even if skipped - this is expected for idempotent processing
      return Result.ok()
    }

    this.logger.log('Reconciliation completed successfully', {
      videoId,
      status: result.status,
    })

    return Result.ok()
  }
}
