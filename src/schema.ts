import {
  GraphQLError,
  GraphQLFloat,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
} from 'graphql'
import { BlockchainApiClient } from './clients/blockchain-api.client'
import { InMemoryCacheStore } from './cache/in-memory-cache.store'
import { ServiceError } from './errors/service-error'
import { BlockConsumptionService } from './services/consumption.service'
import { EnergyCalculator } from './services/energy-calculator'
import type {
  AddressConsumptionResult,
  BlockConsumptionResult,
  RangeConsumptionResult,
} from './types/consumption'

const DEFAULT_CACHE_TTL_SECONDS = 300

const blockchainApiClient = new BlockchainApiClient()
const cacheTtlSeconds = readCacheTtlSeconds()
const cacheStore = new InMemoryCacheStore()
const energyCalculator = new EnergyCalculator()

const consumptionService = new BlockConsumptionService({
  blockchainApiClient,
  cacheStore,
  energyCalculator,
  cacheTtlSeconds,
})

const TransactionConsumptionType = new GraphQLObjectType({
  name: 'TransactionConsumption',
  fields: {
    txHash: { type: new GraphQLNonNull(GraphQLString) },
    timestampMs: {
      type: new GraphQLNonNull(GraphQLString),
      resolve: (value: { timestampMs: number }) => value.timestampMs.toString(),
    },
    sizeBytes: { type: new GraphQLNonNull(GraphQLFloat) },
    energyWh: { type: new GraphQLNonNull(GraphQLFloat) },
  },
})

const BlockConsumptionResultType = new GraphQLObjectType<BlockConsumptionResult>({
  name: 'BlockConsumptionResult',
  fields: {
    blockHash: { type: new GraphQLNonNull(GraphQLString) },
    blockTimeMs: {
      type: new GraphQLNonNull(GraphQLString),
      resolve: (value) => value.blockTimeMs.toString(),
    },
    transactionCount: { type: new GraphQLNonNull(GraphQLInt) },
    totalTransactionEnergyWh: { type: new GraphQLNonNull(GraphQLFloat) },
    totalTransactionEnergykWh: {
      type: new GraphQLNonNull(GraphQLFloat),
      resolve: (value) => value.totalTransactionEnergyWh / 1000,
    },
    transactions: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(TransactionConsumptionType))),
    },
  },
})

const RangeTransactionConsumptionType = new GraphQLObjectType({
  name: 'RangeTransactionConsumption',
  fields: {
    txHash: { type: new GraphQLNonNull(GraphQLString) },
    blockHash: { type: new GraphQLNonNull(GraphQLString) },
    timestampMs: {
      type: new GraphQLNonNull(GraphQLString),
      resolve: (value: { timestampMs: number }) => value.timestampMs.toString(),
    },
    sizeBytes: { type: new GraphQLNonNull(GraphQLFloat) },
    energyWh: { type: new GraphQLNonNull(GraphQLFloat) },
  },
})

const RangeConsumptionResultType = new GraphQLObjectType({
  name: 'RangeConsumptionResult',
  fields: {
    fromTimestampMs: {
      type: new GraphQLNonNull(GraphQLString),
      resolve: (value: RangeConsumptionResult) => value.range.from.toString(),
    },
    toTimestampMs: {
      type: new GraphQLNonNull(GraphQLString),
      resolve: (value: RangeConsumptionResult) => value.range.to.toString(),
    },
    blockHashes: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLString))),
      resolve: (value: RangeConsumptionResult) => value.blockHashes,
    },
    transactionCount: {
      type: new GraphQLNonNull(GraphQLInt),
      resolve: (value: RangeConsumptionResult) =>
        value.blockConsumptions?.reduce(
          (total, blockConsumption) => total + blockConsumption.transactionCount,
          0,
        ) ?? 0,
    },
    totalTransactionEnergyWh: {
      type: new GraphQLNonNull(GraphQLFloat),
      resolve: (value: RangeConsumptionResult) => value.totalRangeEnergyWh,
    },
    totalTransactionEnergykWh: {
      type: new GraphQLNonNull(GraphQLFloat),
      resolve: (value: RangeConsumptionResult) => value.totalRangeEnergyWh / 1000,
    },
    transactions: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(RangeTransactionConsumptionType))),
      resolve: (value: RangeConsumptionResult) =>
        value.blockConsumptions?.flatMap((blockConsumption) =>
          blockConsumption.transactions.map((transaction) => ({
            ...transaction,
            blockHash: blockConsumption.blockHash,
          }))
        ) ?? [],
    },
  },
})

const AddressConsumptionResultType = new GraphQLObjectType({
  name: 'AddressConsumptionResult',
  fields: {
    address: { type: new GraphQLNonNull(GraphQLString) },
    totalEnergyWh: { type: new GraphQLNonNull(GraphQLFloat) },
    transactions: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(TransactionConsumptionType))),
    },
  },
})

const QueryType = new GraphQLObjectType({
  name: 'Query',
  fields: {
    blockConsumption: {
      type: BlockConsumptionResultType,
      args: {
        blockHash: { type: new GraphQLNonNull(GraphQLString) },
      },
      resolve: async (_, args) => {
        try {
          return await consumptionService.getBlockConsumption(String(args.blockHash))
        } catch (error) {
          throw toGraphQLError(error)
        }
      },
    },
    rangeConsumption: {
      type: RangeConsumptionResultType,
      args: {
        fromTimestampMs: { type: GraphQLString },
        toTimestampMs: { type: new GraphQLNonNull(GraphQLString) },
      },
      resolve: async (_, args) => {
        try {
          return await consumptionService.getRangeConsumption(
            Number(args.toTimestampMs),
            args.fromTimestampMs == null ? undefined : Number(args.fromTimestampMs),
          )
        } catch (error) {
          throw toGraphQLError(error)
        }
      },
    },
    addressConsumption: {
      type: AddressConsumptionResultType,
      args: {
        address: { type: new GraphQLNonNull(GraphQLString) },
        fromTimestampMs: { type: GraphQLString },
        toTimestampMs: { type: GraphQLString },
      },
      resolve: async (_, args) => {
        try {
          const rangeArg = parseOptionalAddressRangeArgs(args.fromTimestampMs, args.toTimestampMs)
          return await consumptionService.getAdressConsumption(String(args.address), rangeArg)
        } catch (error) {
          throw toGraphQLError(error)
        }
      },
    },
  },
})

export const schema = new GraphQLSchema({
  query: QueryType,
})

function parseOptionalAddressRangeArgs(
  fromTimestampMs?: string | null,
  toTimestampMs?: string | null,
): { range: { from: number; to: number } } | undefined {
  const hasFrom = fromTimestampMs != null
  const hasTo = toTimestampMs != null

  if (!hasFrom && !hasTo) {
    return undefined
  }

  if (!hasFrom || !hasTo) {
    throw new ServiceError(
      'INVALID_RANGE',
      'Both fromTimestampMs and toTimestampMs must be provided together for addressConsumption',
      {
        fromTimestampMs: fromTimestampMs ?? null,
        toTimestampMs: toTimestampMs ?? null,
      },
    )
  }

  return {
    range: {
      from: Number(fromTimestampMs),
      to: Number(toTimestampMs),
    },
  }
}

function toGraphQLError(error: unknown): GraphQLError {
  if (error instanceof GraphQLError) {
    return error
  }

  if (error instanceof ServiceError) {
    return new GraphQLError(
      error.message,
      undefined,
      undefined,
      undefined,
      undefined,
      error,
      {
        code: error.code,
        details: error.details ?? {},
      },
    )
  }

  return new GraphQLError(
    'Internal server error',
    undefined,
    undefined,
    undefined,
    undefined,
    error instanceof Error ? error : undefined,
    {
      code: 'INTERNAL_SERVER_ERROR',
    },
  )
}

function readCacheTtlSeconds(): number {
  const configuredTtl = Number(process.env.CACHE_TTL_SECONDS ?? DEFAULT_CACHE_TTL_SECONDS)

  if (!Number.isFinite(configuredTtl) || configuredTtl < 0) {
    return DEFAULT_CACHE_TTL_SECONDS
  }

  return Math.floor(configuredTtl)
}
