import { DataSource } from '@core/libs/database/datasource'
import { BaseElysia } from '@core/libs/elysia'
import cors from '@elysiajs/cors'
import { docs } from '@modules/docs'
import { logger } from '@modules/logging'
import { telemetry } from '@modules/telemetry'
import { videoProcessorRoutes } from '@modules/video-processor/presentation/routes'
import { StatusMap } from 'elysia'

const datasource = DataSource.getInstance(logger)

const shutdown = async () => {
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
  .get('/health', async ({ set }) => {
    const database = await datasource.isConnected()
    if (database.isFailure) {
      set.status = StatusMap['Service Unavailable']
      return { status: 'error', timestamp: new Date() }
    }
    return { status: 'ok', timestamp: new Date(), database: database.value }
  })

app.listen(3010, () => {
  logger.log(
    `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
  )
})

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
