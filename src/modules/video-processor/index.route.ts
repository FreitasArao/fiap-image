import { DatabaseExecutionError } from '@core/errors/database.error'
import { BaseElysia } from '@core/libs/elysia'
import { VideoProcessorController } from '@modules/video-processor/presentation/video-processor.controller'
import { StatusMap } from 'elysia'

export const videoProcessorRoute = BaseElysia.create({
  prefix: 'video-processor',
}).post('/', async ({ logger, set }) => {
  const response = await new VideoProcessorController(logger).create()

  if (response.isSuccess) {
    set.status = 200
    return { message: 'Video processor created successfully' }
  }

  if (response.error instanceof DatabaseExecutionError) {
    set.status = StatusMap['Unprocessable Content']
    return { message: 'Error creating video processor' }
  }

  set.status = StatusMap['Internal Server Error']
  return { message: 'Error creating video processor' }
})
