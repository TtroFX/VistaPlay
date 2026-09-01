import { VISTAPLAY_STANDARD_RATES } from '../playbackRates'
import type { PlaybackSnapshot } from '../types'

interface PlaybackRateControlProps {
  player: PlaybackSnapshot
  presets: number[]
  onRate: (rate: number) => void
}

export function PlaybackRateControl({ player, presets, onRate }: PlaybackRateControlProps) {
  const supported = new Set(player.supportedRates)
  const selectorRates = player.desiredRate === 0.25
    ? [0.25, ...VISTAPLAY_STANDARD_RATES]
    : [...VISTAPLAY_STANDARD_RATES]
  const constrained = Math.abs(player.desiredRate - player.actualRate) > 0.001

  return <>
    <select className="rate-select" value={player.desiredRate} onChange={(event) => onRate(Number(event.target.value))} aria-label="再生速度">
      {selectorRates.map((rate) => {
        const verified = supported.has(rate)
        return <option key={rate} value={rate}>{rate}x{verified ? '' : ' — 実機で試行'}</option>
      })}
    </select>
    <div className="speed-preset-strip" role="group" aria-label="再生速度プリセット">
      {presets.map((rate) => {
        const verified = supported.has(rate)
        return <button type="button" className={player.desiredRate === rate ? 'active' : ''} aria-pressed={player.desiredRate === rate} title={verified ? `${rate}x` : `${rate}x を実際に要求して確認します`} onClick={() => onRate(rate)} key={rate}>{rate}x</button>
      })}
    </div>
    <div className="section-kicker" role="status" aria-live="polite">
      Playback Engine: {player.capabilities.label} · 最大確認済み {player.capabilities.maxContinuousRate}x{constrained ? ` · 希望 ${player.desiredRate}x / 実再生 ${player.actualRate}x` : ` · ${player.actualRate}x`}
    </div>
  </>
}
