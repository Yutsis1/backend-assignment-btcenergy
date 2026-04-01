import type { BlockchainBlockPayload } from '../../src/types/blockchain'
import type { BlockConsumptionResult } from '../../src/types/consumption'

export const rawBlockFixture: BlockchainBlockPayload = {
  hash: '00000000000000000000fixtureblock',
  time: 1710000000,
  tx: [
    {
      hash: 'tx-a',
      size: 120,
      time: 1710000001,
    },
    {
      hash: 'tx-b',
      size: 250,
      time: 1710000000,
    },
    {
      hash: 'tx-c',
      size: 0,
      time: 1710000003,
    },
  ],
}

export const expectedBlockConsumptionFixture: BlockConsumptionResult = {
  blockHash: rawBlockFixture.hash,
  blockTimeMs: 1710000000000,
  transactionCount: 3,
  totalTransactionEnergyWh: 1687200,
  transactions: [
    {
      txHash: 'tx-a',
      timestampMs: 1710000001000,
      sizeBytes: 120,
      energyWh: 547200,
    },
    {
      txHash: 'tx-b',
      timestampMs: 1710000000000,
      sizeBytes: 250,
      energyWh: 1140000,
    },
    {
      txHash: 'tx-c',
      timestampMs: 1710000003000,
      sizeBytes: 0,
      energyWh: 0,
    },
  ],
}
