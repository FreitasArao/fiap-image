import { Result } from '@core/domain/result'
import {
  DatabaseConnectionError,
  DatabaseDisconnectionError,
  DatabaseExecutionError,
} from '@core/errors/database.error'
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import cassandra from 'cassandra-driver'
export class DataSource {
  private static instance: DataSource
  private readonly client: cassandra.Client
  private constructor(private readonly logger: AbstractLoggerService) {
    logger.log('Connecting to database')
    this.client = new cassandra.Client({
      contactPoints: Bun.env.CASSANDRA_CONTACT_POINTS?.split(','),
      keyspace: Bun.env.CASSANDRA_KEYSPACE,
    })
  }

  static getInstance(logger: AbstractLoggerService): DataSource {
    if (!DataSource.instance) {
      DataSource.instance = new DataSource(logger)
    }
    return DataSource.instance
  }

  async connect(): Promise<Result<void, DatabaseConnectionError>> {
    try {
      await this.client.connect()
      this.logger.log('Connected to database')
      return Result.ok(undefined)
    } catch (error) {
      return Result.fail(
        DatabaseConnectionError.create(
          error instanceof Error
            ? error.message
            : 'Unkown error trying to connect to database',
        ),
      )
    }
  }

  async disconnect(): Promise<Result<void, DatabaseDisconnectionError>> {
    try {
      await this.client.shutdown()
      this.logger.log('Disconnected from database')
      return Result.ok(undefined)
    } catch (error) {
      return Result.fail(
        DatabaseDisconnectionError.create(
          error instanceof Error
            ? error.message
            : 'Unkown error trying to disconnect from database',
        ),
      )
    }
  }

  async execute(
    query: string,
    params: unknown[],
  ): Promise<Result<cassandra.types.ResultSet, DatabaseExecutionError>> {
    try {
      const result = await this.client.execute(query, params, {
        prepare: true,
        consistency: cassandra.types.consistencies.one,
      })
      return Result.ok(result)
    } catch (error) {
      return Result.fail(
        DatabaseExecutionError.create(
          error instanceof Error ? error.message : 'Execution error',
        ),
      )
    }
  }
}
