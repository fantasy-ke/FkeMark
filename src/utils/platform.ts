const mobileUserAgentPattern = /Android|iPhone|iPad|iPod/i
const mobileLayoutBreakpoint = 767

export const MOBILE_LAYOUT_MEDIA_QUERY = `(max-width: ${mobileLayoutBreakpoint}px)`

export function isMobileUserAgent(userAgent: string, platform = '', maxTouchPoints = 0): boolean {
  return mobileUserAgentPattern.test(userAgent)
    || (platform === 'MacIntel' && maxTouchPoints > 1)
}

export function isMobileRuntime(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  return isMobileUserAgent(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)
    || window.innerWidth <= mobileLayoutBreakpoint
}
