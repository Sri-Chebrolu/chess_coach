import type { ReactNode } from 'react'

const sizeMap = {
  sm: 'text-[12px]',
  md: 'text-[14px]',
  lg: 'text-[16px]',
}

const colorMap = {
  primary: 'text-text-primary',
  secondary: 'text-text-secondary',
  muted: 'text-text-muted',
  accent: 'text-accent',
  error: 'text-error',
}

interface MonoTextProps {
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
  color?: 'primary' | 'secondary' | 'muted' | 'accent' | 'error'
  as?: 'span' | 'p' | 'code'
  className?: string
  'data-testid'?: string
}

export function MonoText({
  children,
  size = 'md',
  color = 'primary',
  as: Tag = 'span',
  className = '',
  'data-testid': testId,
}: MonoTextProps) {
  return (
    <Tag
      data-testid={testId}
      className={`font-mono ${sizeMap[size]} ${colorMap[color]} ${className}`}
    >
      {children}
    </Tag>
  )
}
