import { describe, expect, it } from 'vitest'
import type { VideoRef } from '../domain/types'
import { applyRuntimeFeatureRules } from './videoRules'

const videos: VideoRef[] = [
  { videoId: 'normalvideo', title: 'Normal', durationSeconds: 600 },
  { videoId: 'shortsvideo', title: '#shorts clip', durationSeconds: 45 },
  { videoId: 'livevideo01', title: 'Live', liveStatus: 'live' },
  { videoId: 'upcoming001', title: 'Upcoming', liveStatus: 'upcoming' }
]

describe('runtime video feature rules', () => {
  it('removes Shorts and active/upcoming Live content when disabled', () => {
    expect(applyRuntimeFeatureRules(videos, { shorts: false, live: false }).map((video) => video.videoId)).toEqual(['normalvideo'])
  })
  it('retains feature content when enabled', () => {
    expect(applyRuntimeFeatureRules(videos, { shorts: true, live: true })).toHaveLength(4)
  })
})
