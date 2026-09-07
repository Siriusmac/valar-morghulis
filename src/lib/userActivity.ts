/** Record real foreground use, never token refreshes or background timers. */
export function observeUserActivity(record: () => PromiseLike<unknown>) {
  const report = () => {
    if (document.visibilityState === 'visible') void Promise.resolve(record()).catch(() => undefined)
  }
  report()
  document.addEventListener('visibilitychange', report)
  window.addEventListener('online', report)
  // Long-lived tabs still count while visible; the server throttles writes.
  const timer = window.setInterval(report, 12 * 60 * 60 * 1000)
  return () => {
    document.removeEventListener('visibilitychange', report)
    window.removeEventListener('online', report)
    window.clearInterval(timer)
  }
}
