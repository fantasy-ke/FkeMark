export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export function preferredScrollBehavior(): ScrollBehavior {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches ? 'instant' : 'smooth'
}
