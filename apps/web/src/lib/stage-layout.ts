import type { MapPosition } from '@/features/plant/use-plant-data'

/** Áreas ilustrativas de Layout.png, no coordenadas topográficas ni posiciones guardadas del diagrama. */
const STAGE_AREAS: Record<string, MapPosition> = {
  D01: { x: 18, y: 18 }, D02: { x: 26, y: 26 }, D03: { x: 30, y: 31 },
  D04: { x: 42, y: 9 }, D05: { x: 40, y: 32 }, D06: { x: 47, y: 27 },
  D07: { x: 65, y: 20 }, D08: { x: 76, y: 24 }, D09: { x: 61, y: 38 },
  D10: { x: 82, y: 18 }, D11: { x: 76, y: 29 }, D12: { x: 70, y: 43 },
  D13: { x: 60, y: 58 }, D14: { x: 65, y: 65 }, D15: { x: 57, y: 68 },
  D16: { x: 46, y: 71 }, D17: { x: 62, y: 77 }, D18: { x: 84, y: 55 },
  D19: { x: 93, y: 63 },
}

export const stageLayoutPosition = (code: string | undefined): MapPosition | null => code ? STAGE_AREAS[code] ?? null : null
