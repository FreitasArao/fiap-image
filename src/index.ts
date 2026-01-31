import { DataSource } from '@core/libs/database/datasource'
import { BaseElysia } from '@core/libs/elysia'
import cors from '@elysiajs/cors'
import { docs } from '@modules/docs'
import { healthRoutes } from '@modules/health/presentation/routes'
import { logger } from '@modules/logging'
import { telemetry } from '@modules/telemetry'
import { videoProcessorRoutes } from '@modules/video-processor/presentation/routes'
import {
  startConsumers,
  stopConsumers,
} from '@modules/video-processor/infra/consumers'

const datasource = DataSource.getInstance(logger)

const shutdown = async () => {
  stopConsumers()
  await datasource.disconnect()
}

const app = BaseElysia.create()
  .onStart(async () => {
    await datasource.connect()
  })
  .onStop(shutdown)
  .use(telemetry)
  .use(docs)
  .use(
    cors({
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  )
  .use(videoProcessorRoutes)
  .use(healthRoutes)

app.listen(3010, () => {
  logger.log(
    `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
  )

  // Start SQS consumers for background processing
  startConsumers()
})

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
