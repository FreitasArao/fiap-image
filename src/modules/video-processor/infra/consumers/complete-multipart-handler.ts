import { Result } from '@core/domain/result'
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import { msToNs } from '@core/libs/logging/log-event'
import { CorrelationStore } from '@core/libs/context'
import {
  createStoragePathBuilder,
  StoragePathBuilder,
} from '@modules/video-processor/infra/services/storage'
import { SqsUploadReconciler } from '@modules/video-processor/domain/services/sqs-upload-reconciler.service'

const resource = 'CompleteMultipartHandler'

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
    const startTime = performance.now()
    const { key } = event.detail.object
    const { name: bucket } = event.detail.bucket

    // correlationId is obtained implicitly from CorrelationStore (set by SQS consumer)
    const correlationId = CorrelationStore.correlationId ?? crypto.randomUUID()

    this.logger.log('S3 multipart event received', {
      event: 's3.multipart.received',
      resource,
      message: 'Received S3 CompleteMultipartUpload event',
      's3.bucket': bucket,
      's3.key': key,
      's3.objectKey': key,
    })

    // 1. Parse the storage path to extract videoId
    const fullPath = `${bucket}/${key}`
    const parsed = this.pathBuilder.parse(fullPath)

    if (!parsed) {
      this.logger.error('S3 multipart handling failed (invalid path)', {
        event: 's3.multipart.completed',
        resource,
        message: 'Invalid storage path format',
        status: 'failure',
        duration: msToNs(performance.now() - startTime),
        error: {
          message: 'Invalid storage path format',
          kind: 'ValidationError',
        },
        's3.bucket': bucket,
        's3.key': key,
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
      const err = reconcileResult.error
      this.logger.error('S3 multipart handling failed (reconciliation)', {
        event: 's3.multipart.completed',
        resource,
        message: 'Reconciliation failed',
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
        's3.bucket': bucket,
        's3.key': key,
        'video.id': videoId,
      })
      return Result.fail(reconcileResult.error)
    }

    const result = reconcileResult.value

    if (result.skipped) {
      this.logger.log('S3 multipart completed (skipped, idempotent)', {
        event: 's3.multipart.completed',
        resource,
        message: 'Reconciliation skipped (idempotent)',
        status: 'skipped',
        duration: msToNs(performance.now() - startTime),
        'video.id': videoId,
        reason: result.reason,
      })
      return Result.ok()
    }

    this.logger.log('S3 multipart completed successfully', {
      event: 's3.multipart.completed',
      resource,
      message: 'Reconciliation completed successfully',
      status: 'success',
      duration: msToNs(performance.now() - startTime),
      'video.id': videoId,
      'video.status': result.status,
    })

    return Result.ok()
  }
}
