import { DefaultEntity } from '@core/domain/entity/default-entity'
import { DomainEvent } from '@core/domain/events/domain-event'
import { UniqueEntityID } from '@core/domain/value-objects/unique-entity-id.vo'
import { describe, expect, it } from 'bun:test'

class TestEntity extends DefaultEntity {
  constructor(_: string) {
    super(UniqueEntityID.create())
  }
}

class TestDomainEvent extends DomainEvent<TestEntity> {
  constructor(teste: string) {
    super(new TestEntity(teste))
  }
}

describe('DomainEvent', () => {
  it('should be able to create a domain event', () => {
    const domainEvent = new TestDomainEvent('test')
    expect(domainEvent).toBeDefined()
    expect(domainEvent.eventName).toBe('TestDomainEvent')
    expect(domainEvent.dateTimeOccurred).toBeInstanceOf(Date)
  })
})
