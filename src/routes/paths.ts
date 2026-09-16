export const paths = {
  landing: '/',
  dashboard: '/dashboard',
} as const

export type Path = (typeof paths)[keyof typeof paths]
