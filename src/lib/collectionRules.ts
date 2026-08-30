export function insertUniqueAt<T>(items: T[], item: T, index: number, key: (value: T) => string): T[] {
  const itemKey = key(item)
  if (items.some((value) => key(value) === itemKey)) return items
  const next = [...items]
  next.splice(Math.max(0, Math.min(index, next.length)), 0, item)
  return next
}
