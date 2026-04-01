export async function mapWithConcurrency<TInput, TOutput>(
  items: readonly TInput[],
  concurrency: number,
  mapper: (item: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
  if (items.length === 0) {
    return []
  }

  const normalizedConcurrency =
    Number.isFinite(concurrency) && concurrency > 0 ? Math.min(Math.floor(concurrency), items.length) : items.length

  if (normalizedConcurrency >= items.length) {
    return Promise.all(items.map((item, index) => mapper(item, index)))
  }

  const results = new Array<TOutput>(items.length)
  let nextIndex = 0

  const workers = Array.from({ length: normalizedConcurrency }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  })

  await Promise.all(workers)
  return results
}
