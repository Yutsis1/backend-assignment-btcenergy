import type { CacheStore } from '../cache/cache-store.interface'
import type { BlockchainApiClient } from '../clients/blockchain-api.client'
import type { BlockchainAddressPagePayload, BlockchainBlockPayload } from '../types/blockchain'

export async function readCacheSafely(cacheStore: CacheStore, key: string): Promise<string | null> {
  try {
    return await cacheStore.get(key)
  } catch {
    return null
  }
}

export async function writeCacheSafely(
  cacheStore: CacheStore,
  key: string,
  value: string,
  ttlSeconds: number,
): Promise<void> {
  try {
    await cacheStore.set(key, value, ttlSeconds)
  } catch {
    return
  }
}

export async function getCachedBlock(
  blockchainApiClient: BlockchainApiClient,
  cacheStore: CacheStore,
  cacheTtlSeconds: number,
  blockHash: string,
): Promise<BlockchainBlockPayload> {
  const blockCacheKey = `block:${blockHash}`
  const cachedBlock = await readCacheSafely(cacheStore, blockCacheKey)

  if (cachedBlock) {
    try {
      return JSON.parse(cachedBlock) as BlockchainBlockPayload
    } catch {
      // Ignore bad cache entries and continue with upstream data.
    }
  }

  const block = await blockchainApiClient.getBlock(blockHash)
  await writeCacheSafely(cacheStore, blockCacheKey, JSON.stringify(block), cacheTtlSeconds)
  return block
}

export async function extendAddressCache(
  cacheStore: CacheStore,
  key: string,
  addressData: BlockchainAddressPagePayload,
  ttlSeconds: number,
): Promise<void> {

  let address = await cacheStore.get(key)
  if (address) {
    try {
      const existingData = JSON.parse(address) as BlockchainAddressPagePayload
      existingData.txs.push(...addressData.txs)
      await cacheStore.set(key, JSON.stringify(existingData), ttlSeconds)
    } catch {
      return
    }
  }
}

export function getOrCreatePendingResult<TResult>(
  pendingResults: Map<string, Promise<TResult>>,
  key: string,
  createRequest: () => Promise<TResult>,
): Promise<TResult> {
  const existingRequest = pendingResults.get(key)
  if (existingRequest) {
    return existingRequest
  }

  const request = createRequest().finally(() => {
    pendingResults.delete(key)
  })

  pendingResults.set(key, request)
  return request
}