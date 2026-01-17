import { DatabaseExecutionError } from '@core/errors/database.error'
import { BaseElysia } from '@core/libs/elysia'
import { CreateUrlsUseCase } from '@modules/video-processor/application/create-urls.use-case'
import { CreateVideoUseCase } from '@modules/video-processor/application/create-video.use-case'
import { VideoRepositoryImpl } from '@modules/video-processor/infra/repositories/video-repository-impl'
import { UploadVideoParts } from '@modules/video-processor/infra/services/aws/s3/upload-video-parts'
import { VideoProcessorController } from '@modules/video-processor/presentation/video-processor.controller'
import { StatusMap, t } from 'elysia'

export const videoProcessorRoute = BaseElysia.create({
  prefix: 'video-processor',
})
  .post(
    '/',
    async ({ logger, set }) => {
      const videoRepository = new VideoRepositoryImpl(logger)
      const uploadVideoParts = new UploadVideoParts(logger)
      const createVideoUseCase = new CreateVideoUseCase(
        videoRepository,
        uploadVideoParts,
      )
      const createUrlsUseCase = new CreateUrlsUseCase(
        new UploadVideoParts(logger),
      )

      const controller = new VideoProcessorController(
        logger,
        createVideoUseCase,
        createUrlsUseCase,
      )

      const response = await controller.create()

      if (response.isFailure) {
        set.status = StatusMap['Unprocessable Content']
        return { message: response.error.message }
      }

      if (
        response.isFailure &&
        response.error instanceof DatabaseExecutionError
      ) {
        set.status = StatusMap['Unprocessable Content']
        return { message: 'Error creating video processor' }
      }

      if (response.isFailure && response.error instanceof Error) {
        set.status = StatusMap['Internal Server Error']
        return { message: response.error.message }
      }

      set.status = 200
      return {
        message: 'Video processor created successfully',
        urls: response.value,
      }
    },
    {
      detail: {
        tags: ['Video Processor'],
        summary: 'Criar video e gerar URLs de upload',
        description:
          'Cria um novo video no sistema e retorna as presigned URLs para upload das partes via multipart upload do S3',
      },
      response: {
        200: t.Object({
          message: t.String(),
          urls: t.Array(t.String()),
        }),
        422: t.Object({
          message: t.String(),
        }),
      },
    },
  )
  .post(
    '/simulate/upload-part',
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
        tags: ['Video Processor', 'Simulate'],
        summary: 'Simular upload de parte do video',
        description:
          'Endpoint para simular o frontend enviando uma parte do video para o S3 usando a presigned URL. Retorna o ETag necessario para completar o multipart upload.',
      },
      body: t.Object({
        file: t.File({
          description: 'Arquivo binario da parte do video',
        }),
        presignedUrl: t.String({
          description: 'Presigned URL retornada pelo endpoint de criacao',
        }),
        partNumber: t.String({ description: 'Numero da parte (1-indexed)' }),
      }),
      response: {
        200: t.Object({
          etag: t.Nullable(t.String({ description: 'ETag retornado pelo S3' })),
          partNumber: t.Number({ description: 'Numero da parte enviada' }),
        }),
        400: t.Object({
          error: t.String(),
          status: t.Number(),
        }),
      },
    },
  )
  .post(
    '/simulate/complete-upload',
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
        tags: ['Video Processor', 'Simulate'],
        summary: 'Completar multipart upload',
        description:
          'Endpoint para simular a finalizacao do multipart upload. Recebe o videoId, uploadId e a lista de partes com seus ETags.',
      },
      body: t.Object({
        videoId: t.String({ description: 'ID do video (key no S3)' }),
        uploadId: t.String({ description: 'Upload ID retornado na criacao' }),
        parts: t.Array(
          t.Object({
            partNumber: t.Number({
              description: 'Numero da parte (1-indexed)',
            }),
            etag: t.String({
              description: 'ETag retornado pelo upload da parte',
            }),
          }),
        ),
      }),
      response: {
        200: t.Object({
          message: t.String(),
          location: t.String({ description: 'URL do objeto no S3' }),
          etag: t.String({ description: 'ETag final do objeto' }),
        }),
        400: t.Object({
          error: t.String(),
        }),
      },
    },
  )
