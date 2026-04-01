import { readFileSync } from 'fs'
import { join } from 'path'
import { test, expect,  describe, beforeAll} from '@jest/globals'
import { EnergyCalculator } from '../../src/services/energy-calculator'
import type { BlockchainBlockPayload } from '../../src/types/blockchain'

const ENERGY_PER_BYTE_WH = 4560

describe('EnergyCalculator unit test', () => {
    let blockFixture: BlockchainBlockPayload
    let calculator: EnergyCalculator

    beforeAll(() => {
        blockFixture = loadBlockFixture('examples/block-example.json')
        calculator = new EnergyCalculator()
    })

    test('calculateBlockConsumption returns expected values for block-example.json', () => {
        const result = calculator.calculateBlockConsumption(blockFixture)
        const expectedTotalEnergyWh = blockFixture.tx.reduce(
            (total, transaction) => total + transaction.size * ENERGY_PER_BYTE_WH,
            0,
        )

        expect(result.blockHash).toBe(blockFixture.hash)
        expect(result.blockTimeMs).toBe(blockFixture.time * 1000)
        expect(result.transactionCount).toBe(blockFixture.tx.length)
        expect(result.totalTransactionEnergyWh).toBe(expectedTotalEnergyWh)
        expect(result.transactions).toHaveLength(blockFixture.tx.length)

        const firstInputTx = blockFixture.tx[0]
        const firstResultTx = result.transactions[0]

        expect(firstResultTx.txHash).toBe(firstInputTx.hash)
        expect(firstResultTx.timestampMs).toBe(firstInputTx.time * 1000)
        expect(firstResultTx.sizeBytes).toBe(firstInputTx.size)
        expect(firstResultTx.energyWh).toBe(firstInputTx.size * ENERGY_PER_BYTE_WH)
    })

    test('calculateTransactionsConsumption with range filters transactions correctly', () => {
        const from = blockFixture.time * 1000 + 1000 // 1 second after block time
        const to = blockFixture.time * 1000 + 5000 // 5 seconds after block time
        const blockConsumption = calculator.calculateBlockConsumption(
            blockFixture,
            { range: { from, to } }
        )
        expect(blockConsumption.transactions.every(tx => tx.timestampMs >= from && tx.timestampMs < to)).toBe(true)
    })
})

function loadBlockFixture(relativePath: string): BlockchainBlockPayload {
    const filePath = join(process.cwd(), relativePath)
    const raw = readFileSync(filePath, 'utf8')
    return JSON.parse(raw) as BlockchainBlockPayload
}
