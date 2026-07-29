import { useEffect, useState } from 'react'
import { isMobileRuntime } from '../utils/platform'

export function useMobileRuntime(): boolean {
  const [mobileRuntime, setMobileRuntime] = useState(isMobileRuntime)

  useEffect(() => {
    const updateMobileRuntime = () => setMobileRuntime(isMobileRuntime())
    window.addEventListener('resize', updateMobileRuntime)
    return () => window.removeEventListener('resize', updateMobileRuntime)
  }, [])

  return mobileRuntime
}
