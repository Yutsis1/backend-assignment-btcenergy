import { ServiceError } from '../errors/service-error'
import type {
  BlockchainAddressPagePayload,
  BlockchainBlockPayload,
  BlockchainDayBlockSummary,
  BlockchainTransactionPayload,
} from '../types/blockchain'

// This should be captured from process.env but for simplicity keep that here as a constant
const DEFAULT_ADDRESS_PAGE_LIMIT = 50
const MAX_ADDRESS_PAGE_LIMIT = 50 // (Default: 50, Max: 50)
const DEFAULT_ADDRESS_PAGE_OFFSET = 0

export class BlockchainApiClient {
  private readonly pendingAddressRequests = new Map<string, Promise<BlockchainAddressPagePayload>>()
  private readonly pendingBlockRequests = new Map<string, Promise<BlockchainBlockPayload>>()
  private readonly pendingDayRequests = new Map<string, Promise<BlockchainDayBlockSummary[]>>()

  constructor(
    private readonly baseUrl = process.env.BLOCKCHAIN_API_BASE_URL ?? 'https://blockchain.info',
    // allows to inject a custom fetch implementation for testing purposes
    private readonly fetchImpl: typeof fetch = fetch,
  ) { }

  async getBlock(blockHash: string): Promise<BlockchainBlockPayload> {
    const normalizedBlockHash = blockHash.trim()
    const existingRequest = this.pendingBlockRequests.get(normalizedBlockHash)

    if (existingRequest) {
      return existingRequest
    }

    const request = this.fetchBlock(normalizedBlockHash).finally(() => {
      this.pendingBlockRequests.delete(normalizedBlockHash)
    })

    this.pendingBlockRequests.set(normalizedBlockHash, request)
    return request
  }

  async getBlocksForDay(timestampMs: number): Promise<BlockchainDayBlockSummary[]> {
    const cacheKey = timestampMs.toString()
    const existingRequest = this.pendingDayRequests.get(cacheKey)

    if (existingRequest) {
      return existingRequest
    }

    const request = this.fetchBlocksForDay(timestampMs).finally(() => {
      this.pendingDayRequests.delete(cacheKey)
    })

    this.pendingDayRequests.set(cacheKey, request)
    return request
  }

  async getAddressPage(
    address: string,
    limit = DEFAULT_ADDRESS_PAGE_LIMIT,
    offset = DEFAULT_ADDRESS_PAGE_OFFSET,
  ): Promise<BlockchainAddressPagePayload> {
    const normalizedAddress = this.normalizeAddress(address)
    const normalizedLimit = this.normalizeAddressPageLimit(limit)
    const normalizedOffset = this.normalizeAddressPageOffset(offset)
    const cacheKey = `${normalizedAddress}:${normalizedLimit}:${normalizedOffset}`
    const existingRequest = this.pendingAddressRequests.get(cacheKey)

    if (existingRequest) {
      return existingRequest
    }

    const request = this.fetchAddressPage(
      normalizedAddress,
      normalizedLimit,
      normalizedOffset,
    ).finally(() => {
      this.pendingAddressRequests.delete(cacheKey)
    })

    this.pendingAddressRequests.set(cacheKey, request)
    return request
  }

  private async fetchBlock(blockHash: string): Promise<BlockchainBlockPayload> {
    const response = await this.fetchImpl(`${this.baseUrl}/rawblock/${blockHash}`)

    if (!response.ok) {
      throw new ServiceError('UPSTREAM_API_ERROR', 'Failed to fetch block data', {
        blockHash,
        status: response.status,
      })
    }

    const payload = await this.parseJson(response)
    return this.parseBlockPayload(payload)
  }

  private async fetchBlocksForDay(timestampMs: number): Promise<BlockchainDayBlockSummary[]> {
    const response = await this.fetchImpl(`${this.baseUrl}/blocks/${timestampMs.toString()}?format=json`)

    if (!response.ok) {
      throw new ServiceError('UPSTREAM_API_ERROR', 'Failed to fetch day block list', {
        timestampMs: timestampMs.toString(),
        status: response.status,
      })
    }

    const payload = await this.parseJson(response)
    return this.parseDayBlockPayload(payload)
  }

  private async fetchAddressPage(
    address: string,
    limit: number,
    offset: number,
  ): Promise<BlockchainAddressPagePayload> {
    const requestUrl = new URL(`${this.baseUrl}/rawaddr/${encodeURIComponent(address)}`)
    requestUrl.searchParams.set('limit', limit.toString())
    requestUrl.searchParams.set('offset', offset.toString())

    const response = await this.fetchImpl(requestUrl.toString())

    if (!response.ok) {
      if (response.status === 400) {
        throw new ServiceError('INVALID_ADDRESS', 'Invalid Bitcoin address', {
          address,
          status: response.status,
        })
      }

      if (response.status === 404) {
        throw new ServiceError('ADDRESS_NOT_FOUND', 'Bitcoin address not found', {
          address,
          status: response.status,
        })
      }
      if (response.status === 429) {
        throw new ServiceError('RATE_LIMIT_EXCEEDED', 'Rate limit exceeded', {
          address,
          status: response.status,
        })
      }

      throw new ServiceError('UPSTREAM_ADDRESS_API_ERROR', 'Failed to fetch address data', {
        address,
        limit,
        offset,
        status: response.status,
      })
    }

    const payload = await this.parseJson(response)
    return this.parseAddressPagePayload(payload, { address, limit, offset })
  }

  private async parseJson(response: Response): Promise<unknown> {
    try {
      return await response.json()
    } catch (error) {
      throw new ServiceError('MALFORMED_UPSTREAM_RESPONSE', 'Failed to parse upstream response', {
        cause: error instanceof Error ? error.message : 'unknown',
      })
    }
  }

  private parseBlockPayload(payload: unknown): BlockchainBlockPayload {
    if (!payload || typeof payload !== 'object') {
      throw new ServiceError('MALFORMED_UPSTREAM_RESPONSE', 'Invalid block payload received from upstream')
    }

    const candidate = payload as Record<string, unknown>
    const { hash, time, tx } = candidate

    if (typeof hash !== 'string' || !Number.isFinite(time) || !Array.isArray(tx)) {
      throw new ServiceError('MALFORMED_UPSTREAM_RESPONSE', 'Invalid block payload received from upstream')
    }

    return {
      hash,
      time: Number(time),
      tx: tx.map((entry) => this.parseTransactionPayload(entry)),
    }
  }

  private parseTransactionPayload(payload: unknown): BlockchainTransactionPayload {
    if (!payload || typeof payload !== 'object') {
      throw new ServiceError('MALFORMED_UPSTREAM_RESPONSE', 'Invalid transaction payload received from upstream')
    }

    const candidate = payload as Record<string, unknown>
    const { hash, size, time } = candidate

    if (typeof hash !== 'string' || !Number.isFinite(size)) {
      throw new ServiceError('MALFORMED_UPSTREAM_RESPONSE', 'Invalid transaction payload received from upstream')
    }

    if (time !== undefined && !Number.isFinite(time)) {
      throw new ServiceError('MALFORMED_UPSTREAM_RESPONSE', 'Invalid transaction payload received from upstream')
    }

    return {
      hash,
      size: Number(size),
      time: Number(time),
    }
  }

  private parseDayBlockPayload(payload: unknown): BlockchainDayBlockSummary[] {
    if (!payload || typeof payload !== 'object') {
      throw new ServiceError('MALFORMED_UPSTREAM_RESPONSE', 'Invalid day block payload received from upstream')
    }

    const entries = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as { blocks?: unknown }).blocks)
        ? (payload as { blocks: unknown[] }).blocks
        : null

    if (!entries) {
      throw new ServiceError('MALFORMED_UPSTREAM_RESPONSE', 'Invalid day block payload received from upstream')
    }

    return entries.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') {
        return []
      }

      const candidate = entry as Record<string, unknown>
      return typeof candidate.hash === 'string' && Number.isFinite(candidate.time)
        ? [{ hash: candidate.hash, time: Number(candidate.time) }]
        : []
    })
  }

  private parseAddressPagePayload(
    payload: unknown,
    page: { address: string; limit: number; offset: number },
  ): BlockchainAddressPagePayload {
    if (!payload || typeof payload !== 'object') {
      throw new ServiceError('MALFORMED_UPSTREAM_RESPONSE', 'Invalid address payload received from upstream')
    }

    const candidate = payload as Record<string, unknown>
    const { address, hash160, n_tx, txs } = candidate

    if (typeof address !== 'string' || !Number.isFinite(n_tx) || !Array.isArray(txs)) {
      throw new ServiceError('MALFORMED_UPSTREAM_RESPONSE', 'Invalid address payload received from upstream')
    }

    const normalizedHash160 = typeof hash160 === 'string' ? hash160 : undefined

    return {
      address,
      hash160: normalizedHash160,
      n_tx: Number(n_tx),
      txs: txs.map((entry) => this.parseTransactionPayload(entry)),
      limit: page.limit,
      offset: page.offset,
    }
  }

  private normalizeAddress(address: string): string {
    const normalizedAddress = address.trim()

    if (!normalizedAddress) {
      throw new ServiceError('INVALID_ADDRESS', 'Invalid Bitcoin address', {
        address,
      })
    }

    return normalizedAddress
  }

  private normalizeAddressPageLimit(limit: number): number {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ADDRESS_PAGE_LIMIT) {
      throw new ServiceError('INVALID_ADDRESS', 'Invalid address pagination parameters', {
        limit,
      })
    }

    return limit
  }

  private normalizeAddressPageOffset(offset: number): number {
    if (!Number.isInteger(offset) || offset < 0) {
      throw new ServiceError('INVALID_ADDRESS', 'Invalid address pagination parameters', {
        offset,
      })
    }

    return offset
  }
}
