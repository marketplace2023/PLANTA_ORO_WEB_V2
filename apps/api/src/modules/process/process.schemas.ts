import { z } from 'zod'
import { FLOW_TYPES } from '../../database/schema'

export const createConnectionSchema = z.object({
  sourceStageId: z.uuid(),
  targetStageId: z.uuid(),
  flowType: z.enum(FLOW_TYPES).default('MATERIAL'),
  isReturnFlow: z.boolean().default(false),
})
export type CreateConnectionDto = z.infer<typeof createConnectionSchema>
