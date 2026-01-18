import { BaseElysia } from '@core/libs/elysia'
import { StatusMap, t } from 'elysia'

export const simulateUploadPartRoute = BaseElysia.create({ prefix: '' }).post(
  '/upload-part',
  async ({ body, logger, set }) => {
    const { file, presignedUrl, partNumber: partNumberStr } = body
    const partNumber = Number(partNumberStr)

    logger.log('Simulating upload part', { partNumber, presignedUrl })

    const response = await fetch(presignedUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    })

    if (!response.ok) {
      const errorBody = await response.text()
      logger.error('Failed to upload part', {
        partNumber,
        status: response.status,
        statusText: response.statusText,
        errorBody,
      })
      set.status = StatusMap['Bad Request']
      return {
        error: 'Failed to upload part',
        status: response.status,
        details: errorBody,
      }
    }

    const etag = response.headers.get('ETag')
    logger.log('Part uploaded successfully', { partNumber, etag })

    return { etag, partNumber }
  },
  {
    detail: {
      tags: ['Simulate'],
      summary: 'Simulate part upload',
      description:
        'Simulates frontend uploading a video part to S3 using presigned URL. Returns the ETag needed for CompleteMultipartUpload.',
    },
    body: t.Object({
      file: t.File({
        description: 'Binary file data for the video part',
      }),
      presignedUrl: t.String({
        description: 'Presigned URL returned by the create video endpoint',
      }),
      partNumber: t.String({ description: 'Part number (1-indexed)' }),
    }),
    response: {
      200: t.Object({
        etag: t.Nullable(t.String({ description: 'ETag returned by S3' })),
        partNumber: t.Number({ description: 'Part number that was uploaded' }),
      }),
      400: t.Object({
        error: t.String(),
        status: t.Number(),
        details: t.Optional(t.String()),
      }),
    },
  },
)
