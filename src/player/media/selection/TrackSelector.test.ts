import { describe, expect, it } from 'vitest'
import { selectInitialStream } from './TrackSelector'
import type { MediaStream } from '../types'

const streams: MediaStream[] = [
  { url: 'https://media.example/360.mp4', mimeType: 'video/mp4', container: 'mp4', height: 360, videoOnly: false, audioOnly: false, proxied: true },
  { url: 'https://media.example/720.mp4', mimeType: 'video/mp4', container: 'mp4', height: 720, videoOnly: false, audioOnly: false, proxied: true },
  { url: 'https://media.example/1080.mp4', mimeType: 'video/mp4', container: 'mp4', height: 1080, videoOnly: false, audioOnly: false, proxied: true },
  { url: 'https://media.example/video-only.mp4', mimeType: 'video/mp4', container: 'mp4', height: 720, videoOnly: true, audioOnly: false, proxied: true },
]

describe('selectInitialStream', () => {
  it('prefers a playable proxied muxed 720p MP4 for the initial player path', () => {
    expect(selectInitialStream(streams, () => true).url).toBe('https://media.example/720.mp4')
  })
})
