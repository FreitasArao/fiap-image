import { BaseElysia } from '@core/libs/elysia'
import { UploadVideoParts } from '@modules/video-processor/infra/services/aws/s3/upload-video-parts'
import { StatusMap, t } from 'elysia'

export const simulateCompleteUploadRoute = BaseElysia.create({
  prefix: '',
}).post(
  '/complete-upload',
  async ({ body, logger, set }) => {
    const { videoId, uploadId, parts } = body

    logger.log('Completing multipart upload', {
      videoId,
      uploadId,
      partsCount: parts.length,
    })

    const uploadVideoParts = new UploadVideoParts(logger)
    const result = await uploadVideoParts.completeMultipartUpload({
      key: videoId,
      uploadId,
      parts,
    })

    if (result.isFailure) {
      logger.error('Failed to complete multipart upload', {
        videoId,
        uploadId,
        error: result.error.message,
      })
      set.status = StatusMap['Bad Request']
      return { error: result.error.message }
    }

    logger.log('Multipart upload completed successfully', {
      videoId,
      location: result.value.location,
      etag: result.value.etag,
    })

    return {
      message: 'Upload completed successfully',
      location: result.value.location,
      etag: result.value.etag,
    }
  },
  {
    detail: {
      tags: ['Simulate'],
      summary: 'Complete multipart upload',
      description:
        'Simulates completing the multipart upload. Receives videoId, uploadId and the list of parts with their ETags.',
    },
    body: t.Object({
      videoId: t.String({ description: 'Video ID (key in S3)' }),
      uploadId: t.String({ description: 'Upload ID returned on creation' }),
      parts: t.Array(
        t.Object({
          partNumber: t.Number({
            description: 'Part number (1-indexed)',
          }),
          etag: t.String({
            description: 'ETag returned by the part upload',
          }),
        }),
      ),
    }),
    response: {
      200: t.Object({
        message: t.String(),
        location: t.String({ description: 'S3 object URL' }),
        etag: t.String({ description: 'Final object ETag' }),
      }),
      400: t.Object({
        error: t.String(),
      }),
    },
  },
)
