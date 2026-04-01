import { beforeEach, describe, expect, jest, test } from '@jest/globals'
import { BlockchainApiClient } from '../../src/clients/blockchain-api.client'

describe('BlockchainApiClient', () => {
  let fetchImpl: ReturnType<typeof jest.fn>

  beforeEach(() => {
    fetchImpl = jest.fn()
  })

  test('coalesces concurrent upstream block fetches for the same hash', async () => {
    fetchImpl.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      return {
        ok: true,
        json: async () => ({
          hash: 'block-a',
          time: 1710000000,
          tx: [],
        }),
      }
    })

    const client = new BlockchainApiClient('https://example.test', fetchImpl as typeof fetch)

    const [firstResult, secondResult] = await Promise.all([
      client.getBlock('block-a'),
      client.getBlock('block-a'),
    ])

    expect(firstResult).toEqual({
      hash: 'block-a',
      time: 1710000000,
      tx: [],
    })
    expect(secondResult).toEqual(firstResult)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith('https://example.test/rawblock/block-a')
  })

  test('coalesces concurrent upstream day-window fetches for the same timestamp', async () => {
    fetchImpl.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      return {
        ok: true,
        json: async () => [
          {
            hash: 'block-a',
            time: 1710000000,
          },
        ],
      }
    })

    const client = new BlockchainApiClient('https://example.test', fetchImpl as typeof fetch)

    const [firstResult, secondResult] = await Promise.all([
      client.getBlocksForDay(1710000000000),
      client.getBlocksForDay(1710000000000),
    ])

    expect(firstResult).toEqual([{ hash: 'block-a', time: 1710000000 }])
    expect(secondResult).toEqual(firstResult)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith('https://example.test/blocks/1710000000000?format=json')
  })

  test('fetches an address page with limit and offset pagination parameters', async () => {
    fetchImpl.mockResolvedValue({
      ok: true,
      json: async () => ({
        address: '1BoatSLRHtKNngkdXEeobR76b53LETtpyT',
        hash160: '7680adec8eabcabac676be9e83854ade0bd22cdb',
        n_tx: 120,
        txs: [
          {
            hash: 'tx-1',
            size: 225,
            time: 1710000000,
          },
        ],
      }),
    })

    const client = new BlockchainApiClient('https://example.test', fetchImpl as typeof fetch)

    const result = await client.getAddressPage(' 1BoatSLRHtKNngkdXEeobR76b53LETtpyT ', 25, 50)

    expect(result).toEqual({
      address: '1BoatSLRHtKNngkdXEeobR76b53LETtpyT',
      hash160: '7680adec8eabcabac676be9e83854ade0bd22cdb',
      nTx: 120,
      txs: [
        {
          hash: 'tx-1',
          size: 225,
          time: 1710000000,
        },
      ],
      limit: 25,
      offset: 50,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/rawaddr/1BoatSLRHtKNngkdXEeobR76b53LETtpyT?limit=25&offset=50',
    )
  })

  test('coalesces concurrent upstream address page fetches for the same page', async () => {
    fetchImpl.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      return {
        ok: true,
        json: async () => ({
          address: '1BoatSLRHtKNngkdXEeobR76b53LETtpyT',
          n_tx: 1,
          txs: [],
        }),
      }
    })

    const client = new BlockchainApiClient('https://example.test', fetchImpl as typeof fetch)

    const [firstResult, secondResult] = await Promise.all([
      client.getAddressPage('1BoatSLRHtKNngkdXEeobR76b53LETtpyT', 50, 0),
      client.getAddressPage('1BoatSLRHtKNngkdXEeobR76b53LETtpyT', 50, 0),
    ])

    expect(firstResult).toEqual(secondResult)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/rawaddr/1BoatSLRHtKNngkdXEeobR76b53LETtpyT?limit=50&offset=0',
    )
  })

  test('maps 404 address responses to ADDRESS_NOT_FOUND', async () => {
    fetchImpl.mockResolvedValue({
      ok: false,
      status: 404,
    })

    const client = new BlockchainApiClient('https://example.test', fetchImpl as typeof fetch)

    await expect(
      client.getAddressPage('1BoatSLRHtKNngkdXEeobR76b53LETtpyT'),
    ).rejects.toMatchObject({
      code: 'ADDRESS_NOT_FOUND',
      details: {
        address: '1BoatSLRHtKNngkdXEeobR76b53LETtpyT',
        status: 404,
      },
    })
  })

  test('rejects invalid pagination parameters before calling upstream', async () => {
    const client = new BlockchainApiClient('https://example.test', fetchImpl as typeof fetch)

    await expect(
      client.getAddressPage('1BoatSLRHtKNngkdXEeobR76b53LETtpyT', 51, 0),
    ).rejects.toMatchObject({
      code: 'INVALID_ADDRESS',
      details: {
        limit: 51,
      },
    })

    expect(fetchImpl).not.toHaveBeenCalled()
  })
})



