import { REALM_TOPICS } from '@/modules/realm/contracts'
import { withOptimisticRetry } from '@/platform/event-store/retry'
import type { NewMessage } from '@/platform/outbox/outbox'
import { FORGE_TOPICS } from '../contracts'
import {
  type CraftCommand,
  type CraftError,
  type CraftEvent,
  type CraftState,
  decide,
  evolve,
} from '../domain/craft'
import type { RecipeId } from '../domain/recipes'
import { requestsFor, type SagaRequest } from '../domain/saga'
import { type CraftView, toCraftView } from '../domain/view'
import type { CraftRepository } from './craft-repository'
import type { CraftsReader } from './crafts-reader'

export type CommandResult = { ok: true; view: CraftView } | { ok: false; error: CraftError }

export interface Player {
  id: string
  name: string
}

export interface ForgeServiceOptions {
  dispatch: () => Promise<unknown>
  clock?: () => number
  newId?: () => string
}

function toMessage(request: SagaRequest): NewMessage {
  switch (request.kind) {
    case 'withdraw':
      return {
        topic: REALM_TOPICS.withdraw,
        payload: {
          transferId: request.transferId,
          playerId: request.playerId,
          resources: request.resources,
          replyTo: FORGE_TOPICS.transferResult,
        },
      }
    case 'deposit':
      return {
        topic: REALM_TOPICS.deposit,
        payload: {
          transferId: request.transferId,
          playerId: request.playerId,
          resources: request.resources,
        },
      }
  }
}

function messagesFor(state: CraftState, events: CraftEvent[]): NewMessage[] {
  const messages: NewMessage[] = []
  let current = state
  for (const event of events) {
    current = evolve(current, event)
    for (const request of requestsFor(current, event)) {
      messages.push(toMessage(request))
    }
  }
  return messages
}

export function createForgeService(
  repo: CraftRepository,
  reader: CraftsReader,
  { dispatch, clock = () => Date.now(), newId = () => crypto.randomUUID() }: ForgeServiceOptions,
) {
  function process(craftId: string, command: CraftCommand) {
    return withOptimisticRetry(async () => {
      const { state, version } = await repo.load(craftId)
      const now = clock()
      const decision = decide(state, command, now)
      if (!decision.ok) return decision
      await repo.save(craftId, version, decision.events, messagesFor(state, decision.events))
      return decision
    })
  }

  async function execute(craftId: string, viewerId: string, command: CraftCommand) {
    const decision = await process(craftId, command)
    if (!decision.ok) return decision
    await dispatch()
    const { state } = await repo.load(craftId)
    const view = toCraftView(state, viewerId, clock())
    return view
      ? ({ ok: true, view } as const)
      : ({ ok: false, error: { code: 'CRAFT_NOT_FOUND' } } as const)
  }

  async function startCraft(player: Player, recipeId: RecipeId) {
    const craftId = newId()
    const result = await execute(craftId, player.id, {
      type: 'StartCraft',
      craftId,
      playerId: player.id,
      playerName: player.name,
      recipeId,
    })
    return { craftId, result }
  }

  const cancelCraft = (craftId: string, playerId: string): Promise<CommandResult> =>
    execute(craftId, playerId, { type: 'CancelCraft', playerId })

  const claimItem = (craftId: string, playerId: string): Promise<CommandResult> =>
    execute(craftId, playerId, { type: 'ClaimItem', playerId })

  async function getCraft(craftId: string, viewerId: string) {
    const { state } = await repo.load(craftId)
    return toCraftView(state, viewerId, clock())
  }

  async function overview(viewerId: string) {
    await dispatch()
    return reader.overview(viewerId, clock())
  }

  async function getHeroSpec(playerId: string) {
    const data = await reader.overview(playerId, clock())
    return {
      hp: data.stats.total.hp,
      attack: data.stats.total.attack,
      defense: data.stats.total.defense,
    }
  }

  async function recordRaidUsage(playerId: string) {
    await reader.recordRaidUsage(playerId)
  }

  async function getProductionBonus(playerId: string) {
    const data = await reader.overview(playerId, clock())
    return data.stats.productionBonus
  }

  async function step(craftId: string, command: CraftCommand) {
    const decision = await process(craftId, command)
    if (!decision.ok) throw new Error(`Fabrication ${craftId} : ${decision.error.code}`)
  }

  return {
    startCraft,
    cancelCraft,
    claimItem,
    getCraft,
    overview,
    getHeroSpec,
    recordRaidUsage,
    getProductionBonus,
    step,
  }
}

export type ForgeService = ReturnType<typeof createForgeService>
