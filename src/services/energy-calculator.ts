import type { BlockchainBlockPayload, BlockchainTransactionPayload } from '../types/blockchain'
import type {
  BlockConsumptionResult,
  RangeConsumptionResult,
  TransactionConsumption,
} from '../types/consumption'

// In asignment is specified kWh, but store the data better in integer and convert on client side
// To avoid floating point issues such as 0.1 + 0.2 !== 0.3 in JavaScript
const ENERGY_PER_BYTE_WH = 4560 // 4560 wh

export class EnergyCalculator {
  calculateTransactionEnergy(
    sizeBytes: number | bigint,
    consumptionPerByteWh: number = ENERGY_PER_BYTE_WH,
  ): number {
    return Number(sizeBytes) * consumptionPerByteWh
  }

  calculateTransactionsConsumption(
    txs: BlockchainTransactionPayload[],
    byteCostWh?: number,
    options?: {
      range: { from: number; to: number }
    }
  ): TransactionConsumption[] {
    if (byteCostWh === undefined) {
      byteCostWh = ENERGY_PER_BYTE_WH
    }
    const from = options?.range.from
    const to = options?.range.to
    const transactions = txs.flatMap((transaction) => {
      const txTimestampMs = transaction.time * 1000

      if (
        (from !== undefined && txTimestampMs < from) ||
        (to !== undefined && txTimestampMs >= to)
      ) {
        return []
      }

      return [
        {
          txHash: transaction.hash,
          timestampMs: txTimestampMs,
          sizeBytes: transaction.size,
          energyWh: this.calculateTransactionEnergy(transaction.size, byteCostWh),
        },
      ]
    })
    return transactions
  }


  calculateBlockConsumption(
    block: BlockchainBlockPayload,
    options?: {
      range: { from: number; to: number }
    }): BlockConsumptionResult {
    const blockTimeMs = block.time * 1000 // Convert seconds to milliseconds
    const transactions = this.calculateTransactionsConsumption(block.tx, ENERGY_PER_BYTE_WH, options)
    return {
      blockHash: block.hash,
      blockTimeMs,
      transactionCount: transactions.length,
      totalTransactionEnergyWh: this.sumTransactionEnergy(transactions),
      transactions,
    }
  }

  calculateRangeConsumption(
    range: { from: number; to: number },
    blocks: BlockchainBlockPayload[],
  ): RangeConsumptionResult {
    const blockConsumptions = blocks.map((block) => this.calculateBlockConsumption(block, { range }))
    const totalRangeEnergyWh = blockConsumptions.reduce(
      (total, blockConsumption) => total + blockConsumption.totalTransactionEnergyWh, 0)
    return {
      range: range,
      blockHashes: blocks.map((block) => block.hash),
      totalRangeEnergyWh,
      blockConsumptions,
    }
  }

  private sumTransactionEnergy(transactions: TransactionConsumption[]): number {
    return transactions.reduce((total, transaction) => total + transaction.energyWh, 0)
  }
}
