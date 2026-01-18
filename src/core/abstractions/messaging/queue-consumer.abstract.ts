import type { AbstractLoggerService } from '@core/libs/logging/abstract-logger'

export abstract class AbstractQueueConsumer<TMessage> {
  protected abstract readonly queueUrl: string
  protected abstract readonly logger: AbstractLoggerService

  abstract consume(): AsyncGenerator<{
    message: TMessage
    receiptHandle: string
  }>

  abstract ack(receiptHandle: string): Promise<void>

  abstract nack(receiptHandle: string): Promise<void>

  protected maskQueueUrl(): string {
    try {
      const url = new URL(this.queueUrl)
      return `${url.protocol}//${url.host}/***/${url.pathname.split('/').pop()}`
    } catch {
      return '***masked-queue-url***'
    }
  }
}
