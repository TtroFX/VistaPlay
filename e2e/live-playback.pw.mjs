import { expect, test } from '@playwright/test'

const CANDIDATE_VIDEO_IDS = [
  'M7lc1UVf-VE',
  'jNQXAC9IVRw',
]

test('public resolver delivers a real YouTube stream to VistaPlay-owned video at 4x', async ({ page }) => {
  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await page.goto('/diagnostics/playback')
  await expect(page.getByRole('heading', { name: '新再生経路の実動作確認' })).toBeVisible()

  const attempts = []
  let mounted = false
  for (const videoId of CANDIDATE_VIDEO_IDS) {
    await page.getByLabel('Diagnostics Video ID').fill(videoId)
    await page.getByRole('button', { name: 'Resolve & Mount' }).click()
    try {
      await expect(page.getByTestId('diag-phase')).toHaveText('mounted', { timeout: 55_000 })
      await expect(page.getByTestId('diag-ready')).toHaveText('true', { timeout: 20_000 })
      mounted = true
      break
    } catch {
      attempts.push({
        videoId,
        phase: await page.getByTestId('diag-phase').textContent(),
        resolver: await page.getByTestId('diag-resolver').textContent(),
        stream: await page.getByTestId('diag-stream').textContent(),
        error: await page.getByTestId('diag-error').textContent(),
      })
    }
  }

  expect(mounted, `No public resolver produced playable media. Attempts: ${JSON.stringify(attempts)}. Console: ${consoleErrors.join(' | ')}`).toBe(true)

  const media = page.locator('.vistaplay-media')
  await expect(media).toBeVisible()
  await expect(page.getByTestId('diag-resolver')).toContainText('piped')
  await expect(page.getByTestId('diag-stream')).toContainText('proxied')

  await page.getByRole('button', { name: '4x', exact: true }).click()
  await expect.poll(() => media.evaluate((element) => element.playbackRate)).toBe(4)
  await expect(page.getByTestId('diag-rate')).toHaveText('4x')

  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect.poll(() => media.evaluate((element) => element.currentTime), { timeout: 15_000 }).toBeGreaterThan(0.05)
  await expect(page.getByTestId('diag-error')).toHaveText('—')
})
