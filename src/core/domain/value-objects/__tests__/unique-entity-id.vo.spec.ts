import { UniqueEntityID } from '@core/domain/value-objects/unique-entity-id.vo'
import { describe, expect, it } from 'bun:test'

describe('UniqueEntityID', () => {
  it('should be able to create a unique entity id', () => {
    const uniqueEntityID = UniqueEntityID.create()
    expect(uniqueEntityID.value).toBeTypeOf('string')
    expect(uniqueEntityID.value.length).toBe(36)
  })
  it('should be able to create a unique entity id with a given id', () => {
    const uniqueEntityID = UniqueEntityID.create('123')
    expect(uniqueEntityID.value).toBe('123')
  })
  it('should be able to compare two unique entity ids', () => {
    const uniqueEntityID1 = UniqueEntityID.create('123')
    const uniqueEntityID2 = UniqueEntityID.create('123')

    expect(uniqueEntityID1.equals(uniqueEntityID2)).toBe(true)
  })
})
