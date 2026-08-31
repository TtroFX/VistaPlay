import { describe, expect, it } from 'vitest'
import { defaultSettings, isFeatureRuntimeEnabled } from './features'

describe('feature dependency resolution', () => {
  it('keeps children configured but runtime-disabled when parent is off', () => {
    const features = { ...defaultSettings.features, live: false, liveChat: true, dvr: true }
    expect(features.liveChat).toBe(true)
    expect(isFeatureRuntimeEnabled(features, 'liveChat')).toBe(false)
    expect(isFeatureRuntimeEnabled(features, 'dvr')).toBe(false)
  })

  it('restores dependent features when parent returns', () => {
    const features = { ...defaultSettings.features, chatgpt: true, aiImport: true }
    expect(isFeatureRuntimeEnabled(features, 'aiImport')).toBe(true)
  })
})
