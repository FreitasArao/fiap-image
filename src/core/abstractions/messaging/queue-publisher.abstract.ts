import type { Result } from '@core/domain/result'
import type { AbstractLoggerService } from '@core/libs/logging/abstract-logger'

export abstract class AbstractQueuePublisher<TMessage> {
  protected abstract readonly queueUrl: string
  protected abstract readonly logger: AbstractLoggerService

  abstract publish(message: TMessage): Promise<Result<void, Error>>

  abstract publishBatch(messages: TMessage[]): Promise<Result<void, Error>>

  protected maskQueueUrl(): string {
    try {
      const url = new URL(this.queueUrl)
      return `${url.protocol}//${url.host}/***/${url.pathname.split('/').pop()}`
    } catch {
      return '***masked-queue-url***'
    }
  }
}
