/**
 * Utility for masking sensitive data in log output.
 * Prevents accidental exposure of secrets, tokens, and credentials.
 */
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

  /**
   * Masks sensitive values in a data object.
   * Recursively processes nested objects.
   *
   * @param data - The data object to mask
   * @returns A new object with sensitive values masked
   */
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

  /**
   * Masks a single value, showing only the first 4 characters.
   * @param value - The value to mask
   * @returns The masked value
   */
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

  /**
   * Checks if a key should be treated as sensitive.
   * @param key - The key to check (should be lowercase)
   */
  private static isSensitiveKey(key: string): boolean {
    return SensitiveDataMasker.SENSITIVE_KEYS.has(key)
  }

  /**
   * Adds custom sensitive keys to the list.
   * Useful for domain-specific sensitive data.
   * @param keys - Array of key names to treat as sensitive
   */
  static addSensitiveKeys(keys: string[]): void {
    for (const key of keys) {
      SensitiveDataMasker.SENSITIVE_KEYS.add(key.toLowerCase())
    }
  }
}
