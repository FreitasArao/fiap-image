import { BaseError } from '@core/errors/base.error'

export class DatabaseConnectionError extends BaseError {
  readonly code = 'DATABASE_CONNECTION_ERROR'

  static create(message: string) {
    return new DatabaseConnectionError(message)
  }
}

export class DatabaseDisconnectionError extends BaseError {
  readonly code = 'DATABASE_DISCONNECTION_ERROR'

  static create(message: string) {
    return new DatabaseDisconnectionError(message)
  }
}

export class DatabaseExecutionError extends BaseError {
  readonly code = 'DATABASE_EXECUTION_ERROR'

  static create(message: string) {
    return new DatabaseExecutionError(message)
  }
}
