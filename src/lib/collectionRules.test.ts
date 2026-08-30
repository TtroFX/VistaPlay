import { describe, expect, it } from 'vitest'
import { insertUniqueAt } from './collectionRules'

describe('collection mutations', () => {
  it('restores an item at its original position', () => {
    expect(insertUniqueAt(['a', 'c'], 'b', 1, String)).toEqual(['a', 'b', 'c'])
  })

  it('does not duplicate an item restored after another action added it', () => {
    const items = ['a', 'b']
    expect(insertUniqueAt(items, 'b', 0, String)).toBe(items)
  })

  it('clamps positions after the collection changed', () => {
    expect(insertUniqueAt(['a'], 'b', 20, String)).toEqual(['a', 'b'])
  })
})
