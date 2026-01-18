import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'
import { mockClient } from 'aws-sdk-client-mock'
import {
  SQSClient,
  SendMessageCommand,
  SendMessageBatchCommand,
} from '@aws-sdk/client-sqs'
import { AbstractSQSPublisher } from '../abstract-sqs-publisher'
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'

const sqsMock = mockClient(SQSClient)

class TestPublisher extends AbstractSQSPublisher<{ id: string }> {
  protected serializeMessage(message: { id: string }): string {
    return JSON.stringify(message)
  }
}

describe('AbstractSQSPublisher', () => {
  let logger: AbstractLoggerService
  let publisher: TestPublisher

  beforeEach(() => {
    sqsMock.reset()

    logger = {
      log: mock(),
      error: mock(),
    } as unknown as AbstractLoggerService

    publisher = new TestPublisher(
      logger,
      new SQSClient({ region: 'us-east-1' }),
      'http://queue.url',
    )
  })

  afterEach(() => {
    sqsMock.reset()
  })

  it('should publish message successfully', async () => {
    sqsMock.on(SendMessageCommand).resolves({
      MessageId: 'msg-id-123',
    })

    const result = await publisher.publish({ id: 'msg-1' })

    expect(result.isSuccess).toBe(true)

    const calls = sqsMock.commandCalls(SendMessageCommand)
    expect(calls.length).toBe(1)
    expect(calls[0].args[0].input).toEqual({
      QueueUrl: 'http://queue.url',
      MessageBody: '{"id":"msg-1"}',
    })
  })

  it('should return failure when publish fails', async () => {
    sqsMock.on(SendMessageCommand).rejects(new Error('SQS unavailable'))

    const result = await publisher.publish({ id: 'msg-1' })

    expect(result.isFailure).toBe(true)
    expect(result.error?.message).toBe('SQS unavailable')
  })

  it('should publish batch messages successfully', async () => {
    sqsMock.on(SendMessageBatchCommand).resolves({
      Successful: [{ Id: '0', MessageId: 'msg-0', MD5OfMessageBody: 'md5' }],
      Failed: [],
    })

    const messages = [{ id: 'msg-1' }, { id: 'msg-2' }, { id: 'msg-3' }]
    const result = await publisher.publishBatch(messages)

    expect(result.isSuccess).toBe(true)

    const calls = sqsMock.commandCalls(SendMessageBatchCommand)
    expect(calls.length).toBe(1)
    expect(calls[0].args[0].input.QueueUrl).toBe('http://queue.url')
    expect(calls[0].args[0].input.Entries?.length).toBe(3)
  })

  it('should chunk batch messages when exceeding 10', async () => {
    sqsMock.on(SendMessageBatchCommand).resolves({
      Successful: [],
      Failed: [],
    })

    // Create 15 messages (should be split into 2 batches: 10 + 5)
    const messages = Array.from({ length: 15 }, (_, i) => ({ id: `msg-${i}` }))
    const result = await publisher.publishBatch(messages)

    expect(result.isSuccess).toBe(true)

    const calls = sqsMock.commandCalls(SendMessageBatchCommand)
    expect(calls.length).toBe(2)
    expect(calls[0].args[0].input.Entries?.length).toBe(10)
    expect(calls[1].args[0].input.Entries?.length).toBe(5)
  })

  it('should return failure when batch has failed messages', async () => {
    sqsMock.on(SendMessageBatchCommand).resolves({
      Successful: [],
      Failed: [
        { Id: '0', SenderFault: true, Code: 'Error', Message: 'Failed' },
      ],
    })

    const result = await publisher.publishBatch([{ id: 'msg-1' }])

    expect(result.isFailure).toBe(true)
    expect(result.error?.message).toContain('Failed to publish 1 messages')
  })

  it('should return success for empty batch', async () => {
    const result = await publisher.publishBatch([])

    expect(result.isSuccess).toBe(true)

    // Should not call SQS at all
    const calls = sqsMock.commandCalls(SendMessageBatchCommand)
    expect(calls.length).toBe(0)
  })
})
