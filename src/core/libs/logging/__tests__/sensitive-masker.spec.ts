import { describe, it, expect } from 'bun:test'
import { SensitiveDataMasker } from '../sensitive-masker'

describe('SensitiveDataMasker', () => {
  it('should mask sensitive values in simple object', () => {
    const data = {
      username: 'johndoe',
      password: 'secretpassword',
      token: 'abcd123456',
    }

    const masked = SensitiveDataMasker.mask(data)

    expect(masked.username).toBe('johndoe')
    expect(masked.password).toBe('secr***')
    expect(masked.token).toBe('abcd***')
  })

  it('should recursive mask nested objects', () => {
    const data = {
      user: {
        password: 'nestedSecret',
        profile: {
          etag: '123456789',
        },
      },
    }

    const masked = SensitiveDataMasker.mask(data)

    const maskedUser = masked.user as Record<string, unknown>
    expect(maskedUser.password).toBe('nest***')
    expect((maskedUser.profile as Record<string, unknown>).etag).toBe('1234***')
  })

  it('should mask values in arrays', () => {
    const data = {
      items: [{ secret: 'item1-secret' }, { secret: 'item2-secret' }],
    }

    const masked = SensitiveDataMasker.mask(data)
    const items = masked.items as Record<string, unknown>[]

    expect(items[0].secret).toBe('item***')
    expect(items[1].secret).toBe('item***')
  })

  it('should handle null and undefined safely', () => {
    const data = {
      field: null,
      other: undefined,
    }
    const masked = SensitiveDataMasker.mask(data)
    expect(masked.field).toBeNull()
    expect(masked.other).toBeUndefined()
  })

  it('should case-insensitive match keys', () => {
    const data = {
      PassWord: 'CaseSensitiveSecret',
    }
    const masked = SensitiveDataMasker.mask(data)
    expect(masked.PassWord).toBe('Case***')
  })

  describe('maskValue()', () => {
    it('should return mask suffix for null value', () => {
      const result = SensitiveDataMasker.maskValue(null)
      expect(result).toBe('***')
    })

    it('should return mask suffix for undefined value', () => {
      const result = SensitiveDataMasker.maskValue(undefined)
      expect(result).toBe('***')
    })

    it('should return mask suffix for short values (≤4 chars)', () => {
      expect(SensitiveDataMasker.maskValue('ab')).toBe('***')
      expect(SensitiveDataMasker.maskValue('abcd')).toBe('***')
    })

    it('should mask and keep first 4 chars for longer values', () => {
      expect(SensitiveDataMasker.maskValue('abcde')).toBe('abcd***')
    })

    it('should convert non-string values to string before masking', () => {
      expect(SensitiveDataMasker.maskValue(123456)).toBe('1234***')
    })
  })

  it('should preserve primitive values inside arrays', () => {
    const data = {
      tags: ['public', 'beta', 42],
    }
    const masked = SensitiveDataMasker.mask(data)
    const tags = masked.tags as unknown[]
    expect(tags[0]).toBe('public')
    expect(tags[1]).toBe('beta')
    expect(tags[2]).toBe(42)
  })

  describe('addSensitiveKeys()', () => {
    it('should mask values for newly added custom sensitive keys', () => {
      SensitiveDataMasker.addSensitiveKeys(['ssn', 'credit_card'])

      const data = {
        ssn: '123-45-6789',
        credit_card: '4111111111111111',
        name: 'John',
      }

      const masked = SensitiveDataMasker.mask(data)

      expect(masked.ssn).toBe('123-***')
      expect(masked.credit_card).toBe('4111***')
      expect(masked.name).toBe('John')
    })

    it('should normalize added keys to lowercase', () => {
      SensitiveDataMasker.addSensitiveKeys(['MyCustomSecret'])

      const data = {
        mycustomsecret: 'hidden-value-123',
      }

      const masked = SensitiveDataMasker.mask(data)

      expect(masked.mycustomsecret).toBe('hidd***')
    })

    it('should handle empty array without error', () => {
      SensitiveDataMasker.addSensitiveKeys([])

      const data = { username: 'johndoe' }
      const masked = SensitiveDataMasker.mask(data)

      expect(masked.username).toBe('johndoe')
    })
  })
})
