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
})
