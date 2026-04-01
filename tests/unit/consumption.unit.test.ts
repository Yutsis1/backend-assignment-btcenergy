import { readFileSync } from 'fs'
import { join } from 'path'
import { beforeEach, describe, expect, jest, test } from '@jest/globals'
import { ServiceError } from '../../src/errors/service-error'
import { BlockConsumptionService } from '../../src/services/consumption.service'
import { EnergyCalculator } from '../../src/services/energy-calculator'
import type { CacheStore } from '../../src/cache/cache-store.interface'
import type { BlockchainApiClient } from '../../src/clients/blockchain-api.client'
import type {
    BlockchainAddressPagePayload,
    BlockchainBlockPayload,
    BlockchainDayBlockSummary,
    BlockchainTransactionPayload,
} from '../../src/types/blockchain'
import { rawBlockFixture } from '../fixtures/block-consumption.fixture'

type BlocksShortFixture = {
    blocks: Array<{
        hash: string
        time: number
        height: number
    }>
}

describe('BlockConsumptionService range consumption unit test', () => {
    let calculator: EnergyCalculator
    let getBlocksForDayMock: jest.MockedFunction<BlockchainApiClient['getBlocksForDay']>
    let getBlockMock: jest.MockedFunction<BlockchainApiClient['getBlock']>
    let getAddressPageMock: jest.MockedFunction<BlockchainApiClient['getAddressPage']>
    let cacheGetMock: jest.MockedFunction<CacheStore['get']>
    let cacheSetMock: jest.MockedFunction<CacheStore['set']>

    beforeEach(() => {
        calculator = new EnergyCalculator()

        getBlocksForDayMock = jest.fn<BlockchainApiClient['getBlocksForDay']>()
        getBlockMock = jest.fn<BlockchainApiClient['getBlock']>()
        getAddressPageMock = jest.fn<BlockchainApiClient['getAddressPage']>()
        cacheGetMock = jest.fn<CacheStore['get']>().mockResolvedValue(null)
        cacheSetMock = jest.fn<CacheStore['set']>().mockResolvedValue(undefined)
    })

    test('getRangeConsumption defaults fromTimestampMs to 24h and aggregates short fixture blocks', async () => {
        const shortFixture = loadJsonFixture<BlocksShortFixture>('examples/blocks-example-short.json')
        const dayBlocks = shortFixture.blocks.map(({ hash, time }) => ({ hash, time }))
        const toTimestampMs = shortFixture.blocks[0].time * 1000 + 60_000
        const expectedFromTimestampMs = toTimestampMs - 24 * 60 * 60 * 1000

        const blocksByHash = new Map<string, BlockchainBlockPayload>(
            dayBlocks.map((block, index) => {
                const blockTx = rawBlockFixture.tx.map((transaction, txIndex) => ({
                    ...transaction,
                    hash: `${transaction.hash}-${index}-${txIndex}`,
                    time: block.time + txIndex,
                }))

                return [
                    block.hash,
                    {
                        hash: block.hash,
                        time: block.time,
                        tx: blockTx,
                    },
                ]
            })
        )

        getBlocksForDayMock.mockResolvedValue(dayBlocks)
        getBlockMock.mockImplementation(async (blockHash: string) => {
            const block = blocksByHash.get(blockHash)
            if (!block) {
                throw new Error(`Missing mocked block for hash ${blockHash}`)
            }
            return block
        })

        const service = createService({
            getBlocksForDayMock,
            getBlockMock,
            cacheGetMock,
            cacheSetMock,
            calculator,
        })

        const result = await service.getRangeConsumption(toTimestampMs)

        const expectedBlocks = dayBlocks
            .filter((block) => block.time * 1000 >= expectedFromTimestampMs && block.time * 1000 < toTimestampMs)
            .map((block) => blocksByHash.get(block.hash) as BlockchainBlockPayload)

        const expected = calculator.calculateRangeConsumption(
            { from: expectedFromTimestampMs, to: toTimestampMs },
            expectedBlocks,
        )

        const msPerDay = 24 * 60 * 60 * 1000
        const fromDayStart = Math.floor(expectedFromTimestampMs / msPerDay) * msPerDay
        const toDayStart = Math.floor((toTimestampMs - 1) / msPerDay) * msPerDay
        const expectedDayTimestamps = fromDayStart === toDayStart
            ? [toTimestampMs]
            : [fromDayStart, toDayStart]
        expect(getBlocksForDayMock).toHaveBeenCalledTimes(expectedDayTimestamps.length)
        expect(getBlocksForDayMock.mock.calls.map(([timestampMs]) => timestampMs)).toEqual(expectedDayTimestamps)
        expect(result.range).toEqual({ from: expectedFromTimestampMs, to: toTimestampMs })
        expect(result.blockHashes).toEqual(expected.blockHashes)
        expect(result.totalRangeEnergyWh).toBe(expected.totalRangeEnergyWh)
        expect(result.blockConsumptions).toHaveLength(dayBlocks.length)
    })

    test('getRangeConsumption uses explicit range and only includes blocks inside window', async () => {
        const dayBlocks = loadJsonFixture<BlockchainDayBlockSummary[]>('examples/blocks-example.json')

        const toTimestampMs = 1774037000000
        const fromTimestampMs = 1774036500000

        getBlocksForDayMock.mockResolvedValue(dayBlocks)

        const blockFixture = loadJsonFixture<BlockchainBlockPayload>('examples/block-example.json')
        const txTemplate = blockFixture.tx.slice(0, 3).map((transaction, index) => ({
            ...transaction,
            hash: `${transaction.hash || 'tx'}-${index}`,
            time: 1774036600 + index,
            size: Number(transaction.size ?? 0),
        }))

        const blocksByHash = new Map<string, BlockchainBlockPayload>(
            dayBlocks.map((block, index) => {
                if (index === 0) {
                    return [
                        block.hash,
                        {
                            hash: block.hash,
                            time: block.time,
                            tx: txTemplate,
                        },
                    ]
                }

                return [
                    block.hash,
                    {
                        hash: block.hash,
                        time: block.time,
                        tx: [],
                    },
                ]
            })
        )

        getBlockMock.mockImplementation(async (blockHash: string) => {
            const block = blocksByHash.get(blockHash)
            if (!block) {
                throw new Error(`Missing mocked block for hash ${blockHash}`)
            }
            return block
        })

        const service = createService({
            getBlocksForDayMock,
            getBlockMock,
            cacheGetMock,
            cacheSetMock,
            calculator,
        })

        const result = await service.getRangeConsumption(toTimestampMs, fromTimestampMs)

        const expectedHashes = dayBlocks
            .filter((block) => block.time * 1000 >= fromTimestampMs && block.time * 1000 < toTimestampMs)
            .map((block) => block.hash)
        const expectedBlocks = expectedHashes.map((hash) => blocksByHash.get(hash) as BlockchainBlockPayload)
        const expected = calculator.calculateRangeConsumption(
            { from: fromTimestampMs, to: toTimestampMs },
            expectedBlocks,
        )

        expect(getBlocksForDayMock).toHaveBeenCalledTimes(1)
        expect(getBlocksForDayMock).toHaveBeenCalledWith(toTimestampMs)
        expect(result.range).toEqual({ from: fromTimestampMs, to: toTimestampMs })
        expect(result.blockHashes).toEqual(expectedHashes)
        expect(result.totalRangeEnergyWh).toBe(expected.totalRangeEnergyWh)
        expect(result.blockConsumptions).toHaveLength(expectedHashes.length)
        expect(getBlockMock).toHaveBeenCalledTimes(expectedHashes.length)
    })

    test('getRangeConsumption fetches both UTC day buckets for a cross-midnight range shorter than 24h', async () => {
        const fromTimestampMs = Date.UTC(2024, 0, 1, 23, 30, 0)
        const toTimestampMs = Date.UTC(2024, 0, 2, 0, 30, 0)
        const firstDayStart = Date.UTC(2024, 0, 1, 0, 0, 0)
        const secondDayStart = Date.UTC(2024, 0, 2, 0, 0, 0)

        const firstDayBlocks: BlockchainDayBlockSummary[] = [
            { hash: 'block-before-window', time: Math.floor(Date.UTC(2024, 0, 1, 22, 0, 0) / 1000) },
            { hash: 'block-first-day', time: Math.floor(Date.UTC(2024, 0, 1, 23, 45, 0) / 1000) },
        ]
        const secondDayBlocks: BlockchainDayBlockSummary[] = [
            { hash: 'block-second-day', time: Math.floor(Date.UTC(2024, 0, 2, 0, 15, 0) / 1000) },
            { hash: 'block-after-window', time: Math.floor(Date.UTC(2024, 0, 2, 1, 0, 0) / 1000) },
        ]

        getBlocksForDayMock.mockImplementation(async (timestampMs: number) => {
            if (timestampMs === firstDayStart) {
                return firstDayBlocks
            }
            if (timestampMs === secondDayStart) {
                return secondDayBlocks
            }
            throw new Error(`Unexpected day timestamp ${timestampMs}`)
        })

        const blocksByHash = new Map<string, BlockchainBlockPayload>([
            [
                'block-first-day',
                {
                    hash: 'block-first-day',
                    time: firstDayBlocks[1].time,
                    tx: [createTransaction('tx-first-day', firstDayBlocks[1].time, 100)],
                },
            ],
            [
                'block-second-day',
                {
                    hash: 'block-second-day',
                    time: secondDayBlocks[0].time,
                    tx: [createTransaction('tx-second-day', secondDayBlocks[0].time, 120)],
                },
            ],
        ])

        getBlockMock.mockImplementation(async (blockHash: string) => {
            const block = blocksByHash.get(blockHash)
            if (!block) {
                throw new Error(`Missing mocked block for hash ${blockHash}`)
            }
            return block
        })

        const service = createService({
            getBlocksForDayMock,
            getBlockMock,
            cacheGetMock,
            cacheSetMock,
            calculator,
        })

        const result = await service.getRangeConsumption(toTimestampMs, fromTimestampMs)
        const expectedBlocks = ['block-first-day', 'block-second-day']
            .map((hash) => blocksByHash.get(hash) as BlockchainBlockPayload)
        const expected = calculator.calculateRangeConsumption(
            { from: fromTimestampMs, to: toTimestampMs },
            expectedBlocks,
        )

        expect(getBlocksForDayMock).toHaveBeenCalledTimes(2)
        expect(getBlocksForDayMock).toHaveBeenNthCalledWith(1, firstDayStart)
        expect(getBlocksForDayMock).toHaveBeenNthCalledWith(2, secondDayStart)
        expect(result.range).toEqual({ from: fromTimestampMs, to: toTimestampMs })
        expect(result.blockHashes).toEqual(expected.blockHashes)
        expect(result.totalRangeEnergyWh).toBe(expected.totalRangeEnergyWh)
        expect(result.blockConsumptions).toHaveLength(2)
        expect(getBlockMock).toHaveBeenCalledTimes(2)
    })

    test('getAdressConsumption keeps in-range transactions when range bounds are milliseconds', async () => {
        const address = 'bc1-test-address'
        const range = {
            from: 1710000000000,
            to: 1710000200000,
        }
        const page = createAddressPage(address, [
            createTransaction('tx-in-range', 1710000100, 100),
            createTransaction('tx-too-old', 1709999900, 200),
        ])

        getAddressPageMock.mockResolvedValue(page)

        const service = createService({
            getBlocksForDayMock,
            getBlockMock,
            getAddressPageMock,
            cacheGetMock,
            cacheSetMock,
            calculator,
        })

        const result = await service.getAdressConsumption(address, { range })

        expect(getAddressPageMock).toHaveBeenCalledTimes(1)
        expect(result.transactions).toEqual([
            {
                txHash: 'tx-in-range',
                timestampMs: 1710000100000,
                sizeBytes: 100,
                energyWh: 456000,
            },
        ])
        expect(result.totalEnergyWh).toBe(456000)
    })

    test('getAdressConsumption keeps paging until it reaches an overlapping page for ranged queries', async () => {
        const address = 'bc1-paginated-address'
        const range = {
            from: 1710000000000,
            to: 1710000200000,
        }
        const firstPage = createAddressPage(
            address,
            createTransactions('newer', 1710000400, 50, 100),
            150,
        )
        const overlappingPage = createAddressPage(
            address,
            createTransactions('in-range', 1710000150, 50, 110),
            150,
            50,
        )
        const olderPage = createAddressPage(
            address,
            createTransactions('older', 1709999800, 50, 120),
            150,
            100,
        )

        getAddressPageMock.mockImplementation(async (_address, _limit, offset) => {
            if (offset === 0) {
                return firstPage
            }
            if (offset === 50) {
                return overlappingPage
            }
            if (offset === 100) {
                return olderPage
            }
            throw new Error(`Unexpected offset ${offset}`)
        })

        const service = createService({
            getBlocksForDayMock,
            getBlockMock,
            getAddressPageMock,
            cacheGetMock,
            cacheSetMock,
            calculator,
        })

        const result = await service.getAdressConsumption(address, { range })

        expect(getAddressPageMock).toHaveBeenCalledTimes(3)
        expect(getAddressPageMock).toHaveBeenNthCalledWith(1, address, 50, 0)
        expect(getAddressPageMock).toHaveBeenNthCalledWith(2, address, 50, 50)
        expect(getAddressPageMock).toHaveBeenNthCalledWith(3, address, 50, 100)
        expect(result.transactions).toHaveLength(50)
        expect(result.transactions[0]?.txHash).toBe('in-range-0')
        expect(result.transactions[49]?.txHash).toBe('in-range-49')
        expect(result.totalEnergyWh).toBe(25080000)
    })
    test('getAdressConsumption rejects invalid ranges before fetching address pages', async () => {
        const address = 'bc1-invalid-range'
        const service = createService({
            getBlocksForDayMock,
            getBlockMock,
            getAddressPageMock,
            cacheGetMock,
            cacheSetMock,
            calculator,
        })

        const invalidRangePromise = service.getAdressConsumption(address, {
            range: {
                from: 1710000200000,
                to: 1710000000000,
            },
        })

        await expect(invalidRangePromise).rejects.toBeInstanceOf(ServiceError)
        await expect(invalidRangePromise).rejects.toMatchObject({
            code: 'INVALID_RANGE',
            details: {
                fromTimestampMs: 1710000200000,
                toTimestampMs: 1710000000000,
            },
        })

        expect(getAddressPageMock).not.toHaveBeenCalled()
    })
})

function createService({
    getBlocksForDayMock,
    getBlockMock,
    getAddressPageMock = jest.fn<BlockchainApiClient['getAddressPage']>(),
    cacheGetMock,
    cacheSetMock,
    calculator,
}: {
    getBlocksForDayMock: jest.MockedFunction<BlockchainApiClient['getBlocksForDay']>
    getBlockMock: jest.MockedFunction<BlockchainApiClient['getBlock']>
    getAddressPageMock?: jest.MockedFunction<BlockchainApiClient['getAddressPage']>
    cacheGetMock: jest.MockedFunction<CacheStore['get']>
    cacheSetMock: jest.MockedFunction<CacheStore['set']>
    calculator: EnergyCalculator
}): BlockConsumptionService {
    const blockchainApiClient = {
        getBlocksForDay: getBlocksForDayMock,
        getBlock: getBlockMock,
        getAddressPage: getAddressPageMock,
    } as unknown as BlockchainApiClient

    const cacheStore = {
        get: cacheGetMock,
        set: cacheSetMock,
    } as CacheStore

    return new BlockConsumptionService({
        blockchainApiClient,
        cacheStore,
        energyCalculator: calculator,
        cacheTtlSeconds: 60,
    })
}

function loadJsonFixture<T>(relativePath: string): T {
    const filePath = join(process.cwd(), relativePath)
    const raw = readFileSync(filePath, 'utf8')
    return JSON.parse(raw) as T
}

function createAddressPage(
    address: string,
    txs: BlockchainTransactionPayload[],
    nTx = txs.length,
    offset = 0,
): BlockchainAddressPagePayload {
    return {
        address,
        n_tx: nTx,
        txs,
        limit: 50,
        offset,
    }
}

function createTransactions(
    prefix: string,
    newestTimestampSeconds: number,
    count: number,
    size: number,
): BlockchainTransactionPayload[] {
    return Array.from({ length: count }, (_, index) =>
        createTransaction(`${prefix}-${index}`, newestTimestampSeconds - index, size)
    )
}

function createTransaction(
    hash: string,
    time: number,
    size: number,
): BlockchainTransactionPayload {
    return {
        hash,
        time,
        size,
    }
}




