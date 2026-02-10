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

    expect((masked.user as any).password).toBe('nest***')
    expect((masked.user as any).profile.etag).toBe('1234***')
  })

  it('should mask values in arrays', () => {
    const data = {
      items: [{ secret: 'item1-secret' }, { secret: 'item2-secret' }],
    }

    const masked = SensitiveDataMasker.mask(data)
    const items = masked.items as any[]

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
