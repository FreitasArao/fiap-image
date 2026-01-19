import { Message, SQSClient } from '@aws-sdk/client-sqs'
import { AbstractSQSConsumer } from '@modules/messaging/sqs/abstract-sqs-consumer'
import { VideoRepository } from '@modules/video-processor/domain/repositories/video.repository'
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'

type S3Event = {
  detail: {
    bucket: {
      name: string
    }
    object: {
      key: string
    }
    reason: string // "CompleteMultipartUpload"
  }
}

export class CompleteMultipartConsumer extends AbstractSQSConsumer<S3Event> {
  constructor(
    logger: AbstractLoggerService,
    sqsClient: SQSClient,
    queueUrl: string,
    private readonly videoRepository: VideoRepository,
  ) {
    super(logger, sqsClient, queueUrl)
  }

  protected parseMessage(message: Message): S3Event {
    const body = JSON.parse(message.Body || '{}')
    return body
  }

  protected async handleMessage(event: S3Event): Promise<void> {
    const { key } = event.detail.object
    const { name: bucket } = event.detail.bucket

    this.logger.log('Received S3 CompleteMultipartUpload event', {
      key,
      bucket,
    })

    const videoId = key.split('/')[0]

    const result = await this.videoRepository.findById(videoId)
    if (result.isFailure || !result.value) {
      this.logger.warn(`Video not found for reconciliation: ${videoId}`, {
        key,
      })
      return
    }

    const video = result.value

    if (
      video.status.value === 'UPLOADED' ||
      video.status.value === 'PROCESSING'
    ) {
      this.logger.log(
        'Video already uploaded/processing, skipping reconciliation',
      )
      return
    }

    video.reconcileAllPartsAsUploaded()
    const transitionResult = video.completeUpload()

    if (transitionResult.isFailure) {
      this.logger.error(
        'Failed to transition video status during reconciliation',
        {
          videoId,
          currentStatus: video.status.value,
          error: transitionResult.error,
        },
      )
      return
    }

    await Promise.all([
      ...video.parts.map((part) =>
        this.videoRepository.updateVideoPart(video, part.partNumber),
      ),
      this.videoRepository.updateVideo(video),
    ])

    this.logger.log('Video reconciled successfully via EventBridge', {
      videoId,
    })
  }

  protected async onError(
    error: Error,
    _message: S3Event | null,
  ): Promise<'retry' | 'discard'> {
    this.logger.error('Error handling S3 event', { error })
    // S3 events should generally be retried unless the video truly doesn't exist
    return 'discard'
  }
}
