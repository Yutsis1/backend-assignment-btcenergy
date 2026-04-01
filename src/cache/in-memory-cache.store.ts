import type { CacheStore } from './cache-store.interface'

interface CacheEntry {
  value: string
  expiresAtMs: number
}

export class InMemoryCacheStore implements CacheStore {
  private readonly entries = new Map<string, CacheEntry>()

  async get(key: string): Promise<string | null> {
    const entry = this.entries.get(key)

    if (!entry) {
      return null
    }

    if (entry.expiresAtMs <= Date.now()) {
      this.entries.delete(key)
      return null
    }

    return entry.value
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    const ttlMs = Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds * 1000 : 0

    this.entries.set(key, {
      value,
      expiresAtMs: Date.now() + ttlMs,
    })
  }
}
