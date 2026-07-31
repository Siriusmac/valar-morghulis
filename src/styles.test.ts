import { describe, expect, it } from 'vitest'

function luminance(hex: string) {
  const channels = hex.match(/[a-f\d]{2}/gi)!.map((value) => parseInt(value, 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

function contrast(first: string, second: string) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

describe('focus visible', () => {
  it('usa il colore accentato e supera 3:1 sugli sfondi chiari', async () => {
    const { readFileSync } = await import(['node', 'fs'].join(':'))
    const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')
    expect(css).toMatch(/button:focus-visible[^}]+outline: 3px solid var\(--accent\)/s)
    expect(contrast('#c64e2f', '#ffffff')).toBeGreaterThanOrEqual(3)
    expect(contrast('#c64e2f', '#fbfaf8')).toBeGreaterThanOrEqual(3)
  })
})
