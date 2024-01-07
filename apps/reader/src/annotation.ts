export type AnnotationType = keyof typeof typeMap

export const typeMap = {
  highlight: {
    style: 'backgroundColor',
    class: 'rounded',
  },
  // underline: {
  //   style: 'border-bottom-color',
  //   class: 'border-b-2',
  // },
}

export type AnnotationColor = keyof typeof colorMap

// "dark color + low opacity" is clearer than "light color + high opacity"
// from tailwind [color]-600
export const colorMap = {
  yellow: 'rgba(140, 140, 10, 0.6)',
  red: 'rgba(140, 20, 20, 0.6)',
  green: 'rgba(10, 140, 50, 0.6)',
  blue: 'rgba(10, 50, 140, 0.6)',
}

export interface Annotation {
  id: string
  bookId: string
  cfi: string
  spine: {
    index: number
    title: string
  }
  createAt: number
  updatedAt: number
  type: AnnotationType
  color: AnnotationColor
  notes?: string
  text: string
}
