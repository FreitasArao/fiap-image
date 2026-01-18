export class SensitiveDataMasker {
  private static readonly SENSITIVE_KEYS = new Set([
    'password',
    'token',
    'secret',
    'etag',
    'uploadid',
    'authorization',
    'apikey',
    'api_key',
    'accesstoken',
    'access_token',
    'refreshtoken',
    'refresh_token',
    'credential',
    'private_key',
    'privatekey',
  ])

  private static readonly MASK_SUFFIX = '***'

  static mask<T extends Record<string, unknown>>(data: T): T {
    if (!data || typeof data !== 'object') {
      return data
    }

    const masked = { ...data } as Record<string, unknown>

    for (const [key, value] of Object.entries(masked)) {
      const lowerKey = key.toLowerCase()

      if (SensitiveDataMasker.isSensitiveKey(lowerKey)) {
        masked[key] = SensitiveDataMasker.maskValue(value)
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        masked[key] = SensitiveDataMasker.mask(value as Record<string, unknown>)
      } else if (Array.isArray(value)) {
        masked[key] = value.map((item) =>
          typeof item === 'object' && item !== null
            ? SensitiveDataMasker.mask(item as Record<string, unknown>)
            : item,
        )
      }
    }

    return masked as T
  }

  static maskValue(value: unknown): string {
    if (value === null || value === undefined) {
      return SensitiveDataMasker.MASK_SUFFIX
    }

    const strValue = String(value)
    if (strValue.length <= 4) {
      return SensitiveDataMasker.MASK_SUFFIX
    }

    return `${strValue.substring(0, 4)}${SensitiveDataMasker.MASK_SUFFIX}`
  }

  private static isSensitiveKey(key: string): boolean {
    return SensitiveDataMasker.SENSITIVE_KEYS.has(key)
  }

  static addSensitiveKeys(keys: string[]): void {
    for (const key of keys) {
      SensitiveDataMasker.SENSITIVE_KEYS.add(key.toLowerCase())
    }
  }
}
