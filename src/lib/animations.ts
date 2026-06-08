import type { Variants, Transition } from 'motion/react'
import { useReducedMotion } from 'motion/react'

export { useReducedMotion as usePreferReducedMotion }

export function useAnimationVariants(variants: Variants): Variants {
  const prefersReduced = useReducedMotion()
  if (prefersReduced) {
    return {
      hidden: { opacity: 1 },
      visible: { opacity: 1 },
      exit: { opacity: 1 },
    }
  }
  return variants
}

export const ease = [0.4, 0, 0.2, 1] as const

export const defaultTransition: Transition = {
  duration: 0.25,
  ease,
}

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: defaultTransition },
  exit: { opacity: 0, transition: { duration: 0.15, ease } },
}

export const slideUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: defaultTransition },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15, ease } },
}

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: defaultTransition },
}
