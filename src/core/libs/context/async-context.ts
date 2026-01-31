import { AsyncLocalStorage } from 'node:async_hooks'

export interface CorrelationContext {
  correlationId: string
  traceId?: string
  spanId?: string
}

const asyncLocalStorage = new AsyncLocalStorage<CorrelationContext>()

export const CorrelationStore = {
  run<T>(context: CorrelationContext, fn: () => T): T {
    return asyncLocalStorage.run(context, fn)
  },
  enterWith(context: CorrelationContext): void {
    asyncLocalStorage.enterWith(context)
  },
  getStore(): CorrelationContext | undefined {
    return asyncLocalStorage.getStore()
  },
  get correlationId(): string | undefined {
    return this.getStore()?.correlationId
  },

  get traceId(): string | undefined {
    return this.getStore()?.traceId
  },
  get spanId(): string | undefined {
    return this.getStore()?.spanId
  },
}
