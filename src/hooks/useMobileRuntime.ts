import { useEffect, useState } from 'react'
import { isMobileRuntime, MOBILE_LAYOUT_MEDIA_QUERY } from '../utils/platform'

export function useMobileRuntime(): boolean {
  const [mobileRuntime, setMobileRuntime] = useState(isMobileRuntime)

  useEffect(() => {
    const updateMobileRuntime = () => setMobileRuntime(isMobileRuntime())
    const mobileLayoutQuery = window.matchMedia(MOBILE_LAYOUT_MEDIA_QUERY)
    mobileLayoutQuery.addEventListener('change', updateMobileRuntime)
    return () => mobileLayoutQuery.removeEventListener('change', updateMobileRuntime)
  }, [])

  return mobileRuntime
}
