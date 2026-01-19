import { BaseElysia } from '@core/libs/elysia'
import { t } from 'elysia'
import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge'
import { logger } from '@modules/logging'
import { VideoRepositoryImpl } from '@modules/video-processor/infra/repositories/video-repository-impl'

const eventBridgeClient = new EventBridgeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.AWS_ENDPOINT || process.env.AWS_ENDPOINT_URL,
})

const videoRepository = new VideoRepositoryImpl(logger)

/**
 * Webhook endpoint para receber eventos do S3 via EventBridge API Destination.
 * Quando o S3 CompleteMultipartUpload acontece, o EventBridge chama este endpoint.
 *
 * Fluxo:
 * 1. S3 CompleteMultipartUpload → EventBridge
 * 2. EventBridge API Destination → Este endpoint
 * 3. Este endpoint atualiza o DB e emite evento UPLOADED
 * 4. EventBridge (video-uploaded-rule) → split-queue → split-worker
 */
export const webhookS3CompleteRoute = BaseElysia.create({ prefix: '' }).post(
  '/webhooks/s3/complete-multipart',
  async ({ body, set }) => {
    const { bucket, key } = body

    logger.log('[WEBHOOK] Received S3 CompleteMultipartUpload event', {
      bucket,
      key,
    })

    // Extract object_key from S3 key (remove filename if present, keep the path/id)
    // S3 key can be: "object-key/video.mp4" or just "object-key"
    const objectKey = key.includes('/') ? key.split('/')[0] : key

    // Find video by object_key (the path stored in S3)
    const result = await videoRepository.findByObjectKey(objectKey)
    if (result.isFailure || !result.value) {
      logger.warn(`[WEBHOOK] Video not found for object_key: ${objectKey}`)
      set.status = 404
      return { error: 'Video not found', objectKey }
    }

    const video = result.value
    const videoId = video.id.value

    // Skip if already processed
    if (
      video.status.value === 'UPLOADED' ||
      video.status.value === 'PROCESSING' ||
      video.status.value === 'SPLITTING'
    ) {
      logger.log('[WEBHOOK] Video already processed, skipping', {
        videoId,
        status: video.status.value,
      })
      return {
        message: 'Already processed',
        videoId,
        status: video.status.value,
      }
    }

    // Reconcile all parts as uploaded and transition to UPLOADED
    video.reconcileAllPartsAsUploaded()
    const transitionResult = video.completeUpload()

    if (transitionResult.isFailure) {
      logger.error('[WEBHOOK] Failed to transition video status', {
        videoId,
        currentStatus: video.status.value,
        error: transitionResult.error,
      })
      set.status = 400
      return { error: 'Failed to transition status', videoId }
    }

    // Update database
    await Promise.all([
      ...video.parts.map((part) =>
        videoRepository.updateVideoPart(video, part.partNumber),
      ),
      videoRepository.updateVideo(video),
    ])

    logger.log('[WEBHOOK] Video status updated to UPLOADED', { videoId })

    // Emit UPLOADED event to trigger split-worker
    await eventBridgeClient.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: 'fiapx.video',
            DetailType: 'Video Status Changed',
            Detail: JSON.stringify({
              videoId,
              videoPath:
                video.thirdPartyVideoIntegration?.value.path || videoId,
              status: 'UPLOADED',
              timestamp: new Date().toISOString(),
            }),
          },
        ],
      }),
    )

    logger.log('[WEBHOOK] Emitted UPLOADED event', { videoId })

    return {
      message: 'Video marked as uploaded and processing started',
      videoId,
      status: 'UPLOADED',
    }
  },
  {
    body: t.Object({
      bucket: t.String(),
      key: t.String(),
    }),
  },
)
