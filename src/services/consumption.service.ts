import type { CacheStore } from '../cache/cache-store.interface'
import type { BlockchainApiClient } from '../clients/blockchain-api.client'
import { ServiceError } from '../errors/service-error'
import type { AddressConsumptionResult, BlockConsumptionResult, RangeConsumptionResult } from '../types/consumption'
import type { EnergyCalculator } from './energy-calculator'
import { getCachedBlock } from './service-cache.utils'

interface BlockConsumptionServiceOptions {
  blockchainApiClient: BlockchainApiClient
  cacheStore: CacheStore
  energyCalculator: EnergyCalculator
  cacheTtlSeconds?: number
}


export class BlockConsumptionService {
  private readonly cacheTtlSeconds: number
  private readonly energyCalculator: EnergyCalculator
  private readonly blockchainApiClient: BlockchainApiClient
  private readonly cacheStore: CacheStore

  constructor(private readonly options: BlockConsumptionServiceOptions) {
    this.cacheTtlSeconds = Number(options.cacheTtlSeconds ?? process.env.CACHE_TTL_SECONDS ?? 300)
    this.energyCalculator = options.energyCalculator
    this.blockchainApiClient = options.blockchainApiClient
    this.cacheStore = options.cacheStore
  }

  async getBlockConsumption(blockHash: string): Promise<BlockConsumptionResult> {
    const cacheKey = `blockConsumption:${blockHash}`
    // will read the block from cache
    // othervise will fetch and add to cache
    const cachedResultPromise = await getCachedBlock(
      this.blockchainApiClient,
      this.cacheStore,
      this.cacheTtlSeconds,
      blockHash,
    )
    return this.energyCalculator.calculateBlockConsumption(cachedResultPromise)
  }

  async getRangeBlockConsumption(
    blockHashes: string[],
    range: { from: number; to: number }
  ): Promise<RangeConsumptionResult> {
    // in a day one block can have multiple tranactions, 
    // so we need to get the unique block hashes to avoid fetching the same block multiple times
    const uniqueBlockHashes = [...new Set(blockHashes)] 
    const blocks = await Promise.all(
      uniqueBlockHashes.map((blockHash) =>
        getCachedBlock(
          this.blockchainApiClient,
          this.cacheStore,
          this.cacheTtlSeconds,
          blockHash,
        )
      )
    )
    const blockConsumptions = blocks.map((block) =>
      this.energyCalculator.calculateBlockConsumption(block, { range })
    )
    return {
      range: range,
      blockHashes: uniqueBlockHashes,
      totalRangeEnergyWh: blockConsumptions.reduce(
        (total, blockConsumption) => total + blockConsumption.totalTransactionEnergyWh, 0),
      blockConsumptions: blockConsumptions
    }
  }

  async getRangeConsumption(
    toTimestampMs: number,
    fromTimestampMs?: number,
  ): Promise<RangeConsumptionResult> {

    if (fromTimestampMs === undefined) {
      fromTimestampMs = toTimestampMs - 24 * 60 * 60 * 1000 // default to 24 hours before toTimestampMs
    }

    const dayTimestamps = this.getDayTimestamps(fromTimestampMs, toTimestampMs)
    const dayBlocks = await Promise.all(
      dayTimestamps.map((ts) => this.blockchainApiClient.getBlocksForDay(ts))
    )
    // filter blocks in range from the day blocks
    const blocksInRange = dayBlocks.flat().filter((block) => {
      const blockTimeMs = block.time * 1000
      return blockTimeMs >= fromTimestampMs && blockTimeMs < toTimestampMs
    })
    // fetch block hashes 
    const blockHashes = blocksInRange.map((block) => block.hash)
    return this.getRangeBlockConsumption(blockHashes, { from: fromTimestampMs, to: toTimestampMs })
  }

  async getAdressConsumption(
    address: string,
    options?: { range: { from: number; to: number } },
  ): Promise<AddressConsumptionResult> {
    if (options?.range !== undefined && !this.checkRangeIsValid(options.range.from, options.range.to)) {
      throw new ServiceError(
        'INVALID_RANGE',
        'Invalid range: fromTimestampMs must be less than or equal to toTimestampMs',
        {
          fromTimestampMs: options.range.from,
          toTimestampMs: options.range.to,
        },
      )
    }

    // Get first page of the address  
    const pageLimit = 50 // not modifiyng for now. 50 is max for BlockchainAPI
    const addressPage = await this.blockchainApiClient.getAddressPage(address, pageLimit, 0)
    // chak range options and if exist check if we can skip fetching transactions and return empty result, 
    // otherwise we will fetch the transactions and calculate the consumption
    let rangeOptions: { range: { from: number; to: number } } | undefined = undefined
    if (options?.range !== undefined) {
      rangeOptions = {
        range: {
          from: options.range.from,
          to: options.range.to,
        },
      }
      // No transactions at all
      if (addressPage.txs.length === 0) {
        return {
          address,
          totalEnergyWh: 0,
          transactions: [],
        }
      }
      // First page is newest-first.
      // If even the newest tx is older than `from`, everything is too old.
      // Note: `time` is in seconds, `from` is in milliseconds, so we need to multiply by 1000.
      if (addressPage.txs[0].time * 1000 < options.range.from) {
        return {
          address,
          totalEnergyWh: 0,
          transactions: [],
        }
      }
    }

    // Chaking how many transactions we have to allocate the requests for the transactions
    const allTxs = [...addressPage.txs]
    // If we have more transactions we need to fetch them and calculate the consumption for them
    if (addressPage.n_tx > pageLimit) {
      for (let offset = pageLimit; offset < addressPage.n_tx; offset += pageLimit) {
        const pageTx = await this.blockchainApiClient.getAddressPage(address, pageLimit, offset)

        if (pageTx.txs.length === 0) {
          break
        }

        if (rangeOptions) {
          const newest = pageTx.txs[0].time * 1000
          const oldest = pageTx.txs[pageTx.txs.length - 1].time * 1000

          // Page is entirely newer than requested range
          if (oldest >= rangeOptions.range.to) {
            continue
          }

          // Page is entirely older than requested range
          if (newest < rangeOptions.range.from) {
            break
          }
        }

        allTxs.push(...pageTx.txs)
      }
    }

    const transactions = this.energyCalculator.calculateTransactionsConsumption(
      allTxs,
      undefined,
      rangeOptions
    )
    const totalEnergyWh = transactions.reduce((total, tx) => total + tx.energyWh, 0)

    const finalResult = {
      address: addressPage.address,
      totalEnergyWh,
      transactions,
    }

    return finalResult
  }

  private getDayTimestamps(fromTimestampMs: number, toTimestampMs: number): number[] {
    const MS_PER_DAY = 24 * 60 * 60 * 1000
    const fromDayStart = Math.floor(fromTimestampMs / MS_PER_DAY) * MS_PER_DAY
    const toDayStart = Math.floor((toTimestampMs - 1) / MS_PER_DAY) * MS_PER_DAY

    // Keep the single-call optimization only when the whole range stays within one UTC day.
    if (fromDayStart === toDayStart) {
      return [toTimestampMs]
    }

    return this.offsetCalculation(fromDayStart, toDayStart, MS_PER_DAY)
  }

  /*
    * This function calculates the offsets for the given range and chunk size.
  */
  private offsetCalculation(
    from: number,
    to: number,
    chunk: number): number[] {
    const returnValue: number[] = []
    for (let dayStart = from; dayStart <= to; dayStart += chunk) {
      returnValue.push(dayStart)
    }
    return returnValue
  }
  private checkRangeIsValid(from: number, to: number): boolean {
    return Number.isFinite(from) && Number.isFinite(to) && from <= to
  }

}
