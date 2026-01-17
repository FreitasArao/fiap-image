import type { Result } from '@core/domain/result'
import type { AbstractLoggerService } from '@core/libs/logging/abstract-logger'

/**
 * Abstract base class for queue publishers.
 * Implements dependency inversion for message queue publishing.
 *
 * @template TMessage - The type of message to publish to the queue
 */
export abstract class AbstractQueuePublisher<TMessage> {
  protected abstract readonly queueUrl: string
  protected abstract readonly logger: AbstractLoggerService

  /**
   * Publishes a single message to the queue.
   * @param message - The message to publish
   * @returns Result indicating success or failure
   */
  abstract publish(message: TMessage): Promise<Result<void, Error>>

  /**
   * Publishes multiple messages to the queue in a batch.
   * @param messages - Array of messages to publish
   * @returns Result indicating success or failure
   */
  abstract publishBatch(messages: TMessage[]): Promise<Result<void, Error>>

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
