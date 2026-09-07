// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { observeUserActivity } from './userActivity'

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })
describe('foreground activity', () => {
  it('records visible use, ignores background time and cleans up subscriptions', () => {
    vi.useFakeTimers()
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const record = vi.fn().mockResolvedValue(undefined)
    const stop = observeUserActivity(record)
    expect(record).toHaveBeenCalledTimes(1)
    visibility.mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(12 * 60 * 60 * 1000)
    expect(record).toHaveBeenCalledTimes(1)
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(record).toHaveBeenCalledTimes(2)
    window.dispatchEvent(new Event('online'))
    expect(record).toHaveBeenCalledTimes(3)
    stop()
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(12 * 60 * 60 * 1000)
    expect(record).toHaveBeenCalledTimes(3)
  })
})
