'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { buildChartThemeFromCss } from '@/lib/visualization/chart-theme'
import type { ChartThemeColors } from '@/lib/visualization/chart-options'

export function useChartTheme(): ChartThemeColors {
  const { resolvedTheme } = useTheme()
  const [theme, setTheme] = useState<ChartThemeColors>(() =>
    buildChartThemeFromCss(),
  )

  useEffect(() => {
    setTheme(buildChartThemeFromCss())
  }, [resolvedTheme])

  return theme
}
