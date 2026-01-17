import type { AbstractLoggerService } from '@core/libs/logging/abstract-logger'

/**
 * Abstract base class for queue consumers.
 * Implements dependency inversion for message queue consumption.
 *
 * @template TMessage - The type of message consumed from the queue
 */
export abstract class AbstractQueueConsumer<TMessage> {
  protected abstract readonly queueUrl: string
  protected abstract readonly logger: AbstractLoggerService

  /**
   * Consumes messages from the queue as an async generator.
   * Implementations should handle polling and yield messages as they arrive.
   */
  abstract consume(): AsyncGenerator<TMessage>

  /**
   * Acknowledges successful processing of a message.
   * @param receiptHandle - The receipt handle of the message to acknowledge
   */
  abstract ack(receiptHandle: string): Promise<void>

  /**
   * Negative acknowledgement - returns message to queue for retry.
   * @param receiptHandle - The receipt handle of the message to nack
   */
  abstract nack(receiptHandle: string): Promise<void>

  /**
   * Masks the queue URL for safe logging (removes sensitive parts).
   */
  protected maskQueueUrl(): string {
    try {
      const url = new URL(this.queueUrl)
      return `${url.protocol}//${url.host}/***/${url.pathname.split('/').pop()}`
    } catch {
      return '***masked-queue-url***'
    }
  }
}
