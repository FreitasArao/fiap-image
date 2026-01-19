import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'
import { mockClient } from 'aws-sdk-client-mock'
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
  type Message,
} from '@aws-sdk/client-sqs'
import { AbstractSQSConsumer } from '../abstract-sqs-consumer'
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'

const sqsMock = mockClient(SQSClient)

class TestConsumer extends AbstractSQSConsumer<{ id: string }> {
  public handledMessages: { id: string }[] = []

  protected parseMessage(message: Message): { id: string } {
    return JSON.parse(message.Body || '{}')
  }

  protected async handleMessage(message: { id: string }): Promise<void> {
    this.handledMessages.push(message)
  }

  protected async onError(
    _error: Error,
    _message: { id: string } | null,
  ): Promise<'retry' | 'discard'> {
    return 'discard'
  }
}

describe('AbstractSQSConsumer', () => {
  let logger: AbstractLoggerService
  let consumer: TestConsumer

  beforeEach(() => {
    sqsMock.reset()

    logger = {
      log: mock(),
      error: mock(),
      warn: mock(),
      debug: mock(),
    } as unknown as AbstractLoggerService

    consumer = new TestConsumer(
      logger,
      new SQSClient({ region: 'us-east-1' }),
      'http://queue.url',
    )
  })

  afterEach(() => {
    sqsMock.reset()
  })

  it('should consume messages', async () => {
    // First call returns one message, second returns empty
    sqsMock
      .on(ReceiveMessageCommand)
      .resolvesOnce({
        Messages: [
          {
            MessageId: '1',
            ReceiptHandle: 'handle-1',
            Body: JSON.stringify({ id: 'msg-1' }),
          },
        ],
      })
      .resolves({ Messages: [] })

    sqsMock.on(DeleteMessageCommand).resolves({})

    const iterator = consumer.consume()
    const result = await iterator.next()

    expect(result.value).toEqual({
      message: { id: 'msg-1' },
      receiptHandle: 'handle-1',
    })
  })

  it('should skip messages without body', async () => {
    sqsMock
      .on(ReceiveMessageCommand)
      .resolvesOnce({
        Messages: [
          {
            MessageId: '1',
            ReceiptHandle: 'handle-1',
            Body: undefined, // No body
          },
          {
            MessageId: '2',
            ReceiptHandle: 'handle-2',
            Body: JSON.stringify({ id: 'msg-2' }),
          },
        ],
      })
      .resolves({ Messages: [] })

    const iterator = consumer.consume()
    const result = await iterator.next()

    // Should skip the first message and return the second
    expect(result.value).toEqual({
      message: { id: 'msg-2' },
      receiptHandle: 'handle-2',
    })
  })

  it('should delete message on ack', async () => {
    sqsMock.on(DeleteMessageCommand).resolves({})

    await consumer.ack('receipt-handle-123')

    const calls = sqsMock.commandCalls(DeleteMessageCommand)
    expect(calls.length).toBe(1)
    expect(calls[0].args[0].input).toEqual({
      QueueUrl: 'http://queue.url',
      ReceiptHandle: 'receipt-handle-123',
    })
  })

  it('should change visibility timeout on nack (default 60s)', async () => {
    sqsMock.on(ChangeMessageVisibilityCommand).resolves({})

    await consumer.nack('receipt-handle-456')

    const calls = sqsMock.commandCalls(ChangeMessageVisibilityCommand)
    expect(calls.length).toBe(1)
    expect(calls[0].args[0].input).toEqual({
      QueueUrl: 'http://queue.url',
      ReceiptHandle: 'receipt-handle-456',
      VisibilityTimeout: 60,
    })
  })

  it('should change visibility timeout on nack with custom timeout', async () => {
    sqsMock.on(ChangeMessageVisibilityCommand).resolves({})

    await consumer.nack('receipt-handle-789', 120)

    const calls = sqsMock.commandCalls(ChangeMessageVisibilityCommand)
    expect(calls.length).toBe(1)
    expect(calls[0].args[0].input).toEqual({
      QueueUrl: 'http://queue.url',
      ReceiptHandle: 'receipt-handle-789',
      VisibilityTimeout: 120,
    })
  })
})
