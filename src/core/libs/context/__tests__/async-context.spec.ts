import { describe, it, expect } from 'bun:test'
import { CorrelationStore, type CorrelationContext } from '../async-context'

describe('CorrelationStore', () => {
  describe('run()', () => {
    it('should provide context within the callback', () => {
      const context: CorrelationContext = {
        correlationId: 'test-correlation-id',
        traceId: 'test-trace-id',
        spanId: 'test-span-id',
      }

      CorrelationStore.run(context, () => {
        expect(CorrelationStore.correlationId).toBe('test-correlation-id')
        expect(CorrelationStore.traceId).toBe('test-trace-id')
        expect(CorrelationStore.spanId).toBe('test-span-id')
      })
    })

    it('should return the result from the callback', () => {
      const context: CorrelationContext = { correlationId: 'test' }

      const result = CorrelationStore.run(context, () => {
        return 'callback-result'
      })

      expect(result).toBe('callback-result')
    })

    it('should propagate context through async operations', async () => {
      const context: CorrelationContext = {
        correlationId: 'async-correlation-id',
        traceId: 'async-trace-id',
      }

      await CorrelationStore.run(context, async () => {
        // Simulate async operation
        await new Promise((resolve) => setTimeout(resolve, 10))

        expect(CorrelationStore.correlationId).toBe('async-correlation-id')
        expect(CorrelationStore.traceId).toBe('async-trace-id')
      })
    })

    it('should isolate contexts in nested runs', () => {
      const outerContext: CorrelationContext = { correlationId: 'outer' }
      const innerContext: CorrelationContext = { correlationId: 'inner' }

      CorrelationStore.run(outerContext, () => {
        expect(CorrelationStore.correlationId).toBe('outer')

        CorrelationStore.run(innerContext, () => {
          expect(CorrelationStore.correlationId).toBe('inner')
        })

        // Back to outer context
        expect(CorrelationStore.correlationId).toBe('outer')
      })
    })

    it('should isolate contexts in parallel async operations', async () => {
      const results: string[] = []

      const task1 = CorrelationStore.run(
        { correlationId: 'task1' },
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 20))
          results.push(`task1: ${CorrelationStore.correlationId}`)
        },
      )

      const task2 = CorrelationStore.run(
        { correlationId: 'task2' },
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 10))
          results.push(`task2: ${CorrelationStore.correlationId}`)
        },
      )

      await Promise.all([task1, task2])

      expect(results).toContain('task1: task1')
      expect(results).toContain('task2: task2')
    })
  })

  describe('getStore()', () => {
    it('should return undefined outside of a run context', () => {
      expect(CorrelationStore.getStore()).toBeUndefined()
    })

    it('should return the full context object inside run', () => {
      const context: CorrelationContext = {
        correlationId: 'full-context-test',
        traceId: 'trace-123',
        spanId: 'span-456',
      }

      CorrelationStore.run(context, () => {
        const store = CorrelationStore.getStore()
        expect(store).toEqual(context)
      })
    })
  })

  describe('correlationId getter', () => {
    it('should return undefined outside of a run context', () => {
      expect(CorrelationStore.correlationId).toBeUndefined()
    })

    it('should return the correlationId from context', () => {
      CorrelationStore.run({ correlationId: 'getter-test' }, () => {
        expect(CorrelationStore.correlationId).toBe('getter-test')
      })
    })
  })

  describe('traceId getter', () => {
    it('should return undefined when not set', () => {
      CorrelationStore.run({ correlationId: 'no-trace' }, () => {
        expect(CorrelationStore.traceId).toBeUndefined()
      })
    })

    it('should return traceId when set', () => {
      CorrelationStore.run(
        { correlationId: 'test', traceId: 'trace-id' },
        () => {
          expect(CorrelationStore.traceId).toBe('trace-id')
        },
      )
    })
  })

  describe('enterWith()', () => {
    it('should set context for the current async context', async () => {
      // Run enterWith test in isolated async context to prevent pollution
      await new Promise<void>((resolve) => {
        // Use setImmediate to create a new async context
        setImmediate(() => {
          const context: CorrelationContext = {
            correlationId: 'enter-with-test',
            traceId: 'enter-trace',
          }

          // Note: enterWith() behavior is tested here but should be used carefully
          // It's mainly for HTTP middleware where wrapping isn't possible
          CorrelationStore.enterWith(context)

          expect(CorrelationStore.correlationId).toBe('enter-with-test')
          expect(CorrelationStore.traceId).toBe('enter-trace')

          resolve()
        })
      })
    })
  })
})
