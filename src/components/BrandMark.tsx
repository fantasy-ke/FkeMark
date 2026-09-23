interface BrandMarkProps {
  size?: number
  className?: string
}

/** 应用与文档共用 public/logo.svg，避免标题栏再画一套旧图标。 */
export function BrandMark({ size = 20, className }: BrandMarkProps) {
  return <img className={className} src="/logo.svg" width={size} height={size} alt="" draggable={false} />
}
