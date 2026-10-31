import { z } from 'zod'
import type { MessageHandler } from '@/platform/outbox/outbox'
import type { ForgeService } from './application/forge-service'
import { FORGE_TOPICS } from './contracts'
import { craftIdOf } from './domain/craft'

/** Réponse du Village à un mouvement de ressources. */
const TransferResultMessage = z.object({
  transferId: z.string().min(1),
  outcome: z.enum(['withdrawn', 'refused', 'deposited']),
  missing: z.record(z.string(), z.number()).optional(),
})

/**
 * Gestionnaires des messages adressés à la Forge : les réponses du Village, qui font progresser
 * la saga de fabrication.
 */
export function createForgeHandlers(service: ForgeService): Record<string, MessageHandler> {
  return {
    [FORGE_TOPICS.transferResult]: async (message) => {
      const { transferId, outcome, missing } = TransferResultMessage.parse(message.payload)
      const craftId = craftIdOf(transferId)
      if (!craftId) return
      await service.step(craftId, {
        type: 'RecordTransferResult',
        transferId,
        outcome,
        missing,
      })
    },
  }
}
