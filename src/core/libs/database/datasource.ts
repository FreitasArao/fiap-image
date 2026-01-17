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
    this.client = new cassandra.Client({
      contactPoints: Bun.env.CASSANDRA_CONTACT_POINTS?.split(','),
      keyspace: Bun.env.CASSANDRA_KEYSPACE,
      localDataCenter: Bun.env.CASSANDRA_LOCAL_DATA_CENTER,
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
      this.logger.log('Connecting to database')
      await this.client.connect()
      this.logger.log('Connected to database')
      return Result.ok(undefined)
    } catch (error) {
      this.logger.error('Error connecting to database', { error })
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
      this.logger.error('Error disconnecting from database', { error })
      return Result.fail(
        DatabaseDisconnectionError.create(
          error instanceof Error
            ? error.message
            : 'Unkown error trying to disconnect from database',
        ),
      )
    }
  }

  async startTransaction(): Promise<Result<void, DatabaseExecutionError>> {
    try {
      await this.client.execute('BEGIN')
      return Result.ok(undefined)
    } catch (error) {
      return Result.fail(
        DatabaseExecutionError.create(
          error instanceof Error
            ? error.message
            : 'Unkown error trying to start transaction',
        ),
      )
    }
  }

  async commitTransaction(): Promise<Result<void, DatabaseExecutionError>> {
    try {
      await this.client.execute('COMMIT')
      return Result.ok(undefined)
    } catch (error) {
      return Result.fail(
        DatabaseExecutionError.create(
          error instanceof Error
            ? error.message
            : 'Unkown error trying to commit transaction',
        ),
      )
    }
  }

  async rollbackTransaction(): Promise<Result<void, DatabaseExecutionError>> {
    try {
      await this.client.execute('ROLLBACK')
      return Result.ok(undefined)
    } catch (error) {
      return Result.fail(
        DatabaseExecutionError.create(
          error instanceof Error
            ? error.message
            : 'Unkown error trying to rollback transaction',
        ),
      )
    }
  }

  async executeTransaction(
    queries: string[],
    params: unknown[][],
    consistency: cassandra.types.consistencies = cassandra.types.consistencies
      .one,
  ): Promise<Result<void, DatabaseExecutionError>> {
    try {
      await this.startTransaction()
      await this.client.execute(queries.join(';'), params, {
        consistency,
        prepare: true,
      })
      await this.commitTransaction()
    } catch (error) {
      await this.rollbackTransaction()
      return Result.fail(
        DatabaseExecutionError.create(
          error instanceof Error
            ? error.message
            : 'Unkown error trying to execute transaction',
        ),
      )
    }
    return Result.ok(undefined)
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
      this.logger.log('Query executed successfully', { result })
      return Result.ok(result)
    } catch (error) {
      this.logger.error('Error executing query', { error })
      return Result.fail(
        DatabaseExecutionError.create(
          error instanceof Error ? error.message : 'Execution error',
        ),
      )
    }
  }
}
