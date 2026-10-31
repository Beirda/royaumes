'use client'

import { hc } from 'hono/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import { useCountdown } from '@/ui/use-countdown'
import type { DungeonApi } from './api'
import {
  type Action,
  DIFFICULTIES,
  type Difficulty,
  type Effect,
  type GameError,
  type GameView,
  gameChannel,
  MAX_HEROES,
  MONSTERS,
  type Monster,
  type OpenGame,
} from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<DungeonApi>('/api/dungeon')

/** Erreurs que l'API peut renvoyer : erreurs métier et erreur de validation. */
type ApiError = { code: GameError['code'] | 'INVALID_INPUT'; message?: string }

/** Message affiché au joueur pour chaque erreur. */
const ERRORS: Record<ApiError['code'], string> = {
  INVALID_INPUT: 'Saisie invalide.',
  GAME_NOT_FOUND: 'Expédition introuvable.',
  ALREADY_EXISTS: 'Expédition déjà ouverte.',
  WRONG_PHASE: 'Cette action n’est plus possible.',
  GAME_FULL: 'L’expédition est complète.',
  ALREADY_JOINED: 'Vous faites déjà partie de l’expédition.',
  NOT_A_MEMBER: 'Vous ne faites pas partie de l’expédition.',
  NOT_HOST: 'Seul l’hôte peut lancer l’expédition.',
  NOT_YOUR_TURN: 'Ce n’est pas votre tour.',
  HERO_DOWN: 'Votre héros est tombé.',
  ROUND_OVER: 'La manche est déjà terminée.',
  ALREADY_CHOSEN: 'Vous avez déjà choisi votre action.',
  INVALID_TARGET: 'Cible invalide.',
}

/** Libellé de chaque niveau de difficulté. */
const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Facile (3 salles)',
  hard: 'Difficile (5 salles)',
}

/** Libellé affiché pour chaque état de la connexion temps réel. */
const STATUS_LABELS = {
  connecting: 'Connexion...',
  open: 'Temps réel connecté',
  reconnecting: 'Reconnexion...',
} as const

// ---------------------------------------------------------------------------
// Liste des expéditions ouvertes
// ---------------------------------------------------------------------------

/** Écran d'accueil du Donjon : expéditions ouvertes et ouverture d'une expédition. */
export function DungeonLobby() {
  const router = useRouter()
  const [games, setGames] = useState<OpenGame[] | undefined>(undefined)
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    const res = await client.games.$get()
    if (res.ok) setGames((await res.json()).games)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function open() {
    setLoading(true)
    try {
      const res = await client.games.$post({ json: { difficulty } })
      if (res.ok) router.push(`/dungeon/${(await res.json()).gameId}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <h1>
            <Entity kind="dungeon" /> Donjon & Expéditions
          </h1>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.95rem' }}>
            Bravez les monstres des catacombes en groupe et amassez du butin pour votre royaume
          </p>
        </div>
      </div>

      {/* Ouverture d'une nouvelle expédition */}
      <section
        className="panel"
        style={{
          border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
          marginBottom: '16px',
        }}
      >
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.15rem' }}>⚔️ Nouvelle expédition</h2>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label htmlFor="difficulty" style={{ fontWeight: 600, fontSize: '0.9rem' }}>
              Difficulté :
            </label>
            <select
              id="difficulty"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1px solid color-mix(in srgb, var(--muted) 40%, transparent)',
                background: 'var(--panel)',
                color: 'var(--ink)',
                font: 'inherit',
              }}
            >
              {DIFFICULTIES.map((level) => (
                <option key={level} value={level}>
                  {DIFFICULTY_LABELS[level]}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={open}
            style={{ fontWeight: 600, padding: '8px 16px' }}
          >
            Ouvrir une expédition
          </button>
        </div>
      </section>

      {/* Expéditions ouvertes */}
      <section className="panel" aria-label="Expéditions ouvertes">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Expéditions en attente d’aventuriers</h2>
          <button className="link" type="button" onClick={refresh}>
            Actualiser
          </button>
        </div>

        {games === undefined && <p className="muted">Chargement des expéditions...</p>}
        {games?.length === 0 && (
          <p className="muted" style={{ padding: '12px 0', margin: 0 }}>
            Aucune expédition ouverte pour le moment. Soyez le premier à en ouvrir une ci-dessus !
          </p>
        )}

        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '8px' }}>
          {games?.map((game) => (
            <li
              key={game.gameId}
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                background: 'color-mix(in srgb, var(--bg) 45%, var(--panel))',
                border: '1px solid color-mix(in srgb, var(--muted) 20%, transparent)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <div>
                <strong style={{ fontSize: '1rem', color: 'var(--ink)' }}>
                  Expédition de {game.hostName}
                </strong>
                <div style={{ fontSize: '0.85rem', marginTop: '2px', color: 'var(--muted)' }}>
                  Groupe :{' '}
                  <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
                    {game.heroCount}/{MAX_HEROES} héros
                  </span>
                </div>
              </div>

              <Link
                href={`/dungeon/${game.gameId}`}
                style={{
                  display: 'inline-block',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  background: 'var(--accent)',
                  color: 'white',
                  textDecoration: 'none',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                }}
              >
                Rejoindre / Voir
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Expédition & Raid Combat
// ---------------------------------------------------------------------------

function monsterName(monster: Monster, monsters: Monster[]) {
  const sameKind = monsters.filter((other) => other.kind === monster.kind)
  const name = MONSTERS[monster.kind].name
  return sameKind.length > 1 ? `${name} ${sameKind.indexOf(monster) + 1}` : name
}

function describeAction(action: Action, nameOf: (id: string) => string) {
  if (action.type === 'attack') return `attaquer ${nameOf(action.target)}`
  if (action.type === 'heal') return `soigner ${nameOf(action.target)}`
  return 'se défendre'
}

const ofVerb = (text: string) => (/^[aeéiou]/i.test(text) ? `d’${text}` : `de ${text}`)

function describeEffect(effect: Effect, nameOf: (id: string) => string) {
  return effect.kind === 'damage'
    ? `${nameOf(effect.source)} inflige ${effect.amount} dégâts à ${nameOf(effect.target)}`
    : `${nameOf(effect.source)} rend ${effect.amount} points de vie à ${nameOf(effect.target)}`
}

/** Barre de vie stylisée */
function HealthBar({ current, max }: { current: number; max: number }) {
  const percent = Math.max(0, Math.min(100, Math.round((current / max) * 100)))
  const color = percent > 50 ? 'var(--ok)' : percent > 25 ? 'var(--warn)' : '#dc2626'

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '180px',
        height: '8px',
        borderRadius: '4px',
        background: 'color-mix(in srgb, var(--muted) 30%, transparent)',
        overflow: 'hidden',
        marginTop: '4px',
      }}
    >
      <div
        style={{
          width: `${percent}%`,
          height: '100%',
          background: color,
          borderRadius: '4px',
          transition: 'width 0.3s ease',
        }}
      />
    </div>
  )
}

/** Écran d'une expédition : salon, exploration, combat et fin de l'expédition. */
export function DungeonGame({ gameId, userId }: { gameId: string; userId: string }) {
  const [view, setView] = useState<GameView | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const param = { id: gameId }

  const refresh = useCallback(async () => {
    const res = await client.games[':id'].$get({ param: { id: gameId } })
    if (res.ok) setView((await res.json()).view)
    else if (res.status === 404) setView(null)
  }, [gameId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const status = useChannel(view?.isMember ? gameChannel(gameId) : null, refresh)

  function handle(body: { view: GameView } | { error: ApiError }) {
    if ('error' in body) {
      setError(ERRORS[body.error.code])
      refresh()
    } else {
      setError(null)
      setView(body.view)
    }
  }

  const addCompanion = async () =>
    handle(await (await client.games[':id'].companion.$post({ param })).json())
  const join = async () => handle(await (await client.games[':id'].join.$post({ param })).json())
  const start = async () => handle(await (await client.games[':id'].start.$post({ param })).json())
  const openDoor = async () =>
    handle(await (await client.games[':id'].door.$post({ param })).json())

  async function act(action: Action) {
    if (!view) return
    const res = await client.games[':id'].action.$post({
      param,
      json: { round: view.round, action },
    })
    handle(await res.json())
  }

  const checkDeadline = useCallback(async () => {
    const res = await client.games[':id'].deadline.$post({ param: { id: gameId } })
    if (res.ok) setView((await res.json()).view)
  }, [gameId])

  const remaining = useCountdown(
    view?.isMember && (view.phase === 'combat' || view.phase === 'exploring')
      ? view.deadline
      : null,
    checkDeadline,
  )

  const title = (
    <div className="row" style={{ justifyContent: 'space-between', marginBottom: '16px' }}>
      <div>
        <h1 style={{ margin: 0 }}>
          <Entity kind="dungeon" /> Expédition
          {view && (
            <span
              style={{
                fontSize: '0.9rem',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '6px',
                marginLeft: '8px',
                background: 'color-mix(in srgb, var(--accent) 15%, var(--panel))',
                color: 'var(--accent)',
              }}
            >
              {DIFFICULTY_LABELS[view.difficulty]}
            </span>
          )}
        </h1>
        <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
          Identifiant : {gameId.slice(0, 8)}...
        </p>
      </div>
      {view?.isMember && (
        <span className="status" data-status={status}>
          {STATUS_LABELS[status]}
        </span>
      )}
    </div>
  )

  if (view === undefined) return <main>{title}</main>
  if (view === null) {
    return (
      <main>
        {title}
        <div
          className="panel"
          style={{ border: '1px solid color-mix(in srgb, var(--warn) 30%, transparent)' }}
        >
          <p className="error" style={{ margin: '0 0 12px 0' }}>
            {ERRORS.GAME_NOT_FOUND}
          </p>
          <Link href="/dungeon">Retour au Donjon</Link>
        </div>
      </main>
    )
  }

  const nameOf = (id: string) => {
    const hero = view.heroes.find((h) => h.id === id)
    if (hero) return hero.name
    const monster = view.monsters.find((m) => m.id === id)
    return monster ? monsterName(monster, view.monsters) : id
  }

  const me = view.heroes.find((hero) => hero.id === userId)
  const standingMonsters = view.monsters.filter((monster) => monster.hp > 0)
  const standingHeroes = view.heroes.filter((hero) => hero.hp > 0)

  return (
    <main>
      {title}

      {error && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius, 8px)',
            background: 'color-mix(in srgb, var(--warn) 15%, var(--panel))',
            color: 'var(--warn)',
            border: '1px solid color-mix(in srgb, var(--warn) 30%, transparent)',
            marginBottom: '16px',
          }}
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Équipe des Héros */}
      <section className="panel" aria-label="Héros" style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: '0 0 10px 0', fontSize: '1.15rem' }}>🛡️ Groupe d’aventuriers</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '10px',
          }}
        >
          {view.heroes.map((hero) => {
            const isDown = hero.hp <= 0
            const isCurrent = hero.id === userId
            return (
              <div
                key={hero.id}
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  background: isDown
                    ? 'color-mix(in srgb, var(--muted) 15%, var(--panel))'
                    : isCurrent
                      ? 'color-mix(in srgb, var(--accent) 12%, var(--panel))'
                      : 'color-mix(in srgb, var(--bg) 40%, var(--panel))',
                  border: isCurrent
                    ? '1px solid color-mix(in srgb, var(--accent) 40%, transparent)'
                    : '1px solid color-mix(in srgb, var(--muted) 20%, transparent)',
                  opacity: isDown ? 0.6 : 1,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <strong
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      color: 'var(--ink)',
                    }}
                  >
                    <Entity kind={hero.companion ? 'companion' : 'hero'} /> {hero.name}
                  </strong>
                  {hero.id === view.hostId && (
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        padding: '1px 5px',
                        borderRadius: '4px',
                        background: 'color-mix(in srgb, var(--accent) 20%, var(--panel))',
                        color: 'var(--accent)',
                      }}
                    >
                      Hôte
                    </span>
                  )}
                </div>

                <div
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--muted)',
                    margin: '4px 0 2px',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>
                    PV : {hero.hp}/{hero.maxHp}
                  </span>
                  <span>
                    ⚔️ {hero.attack} {hero.defense > 0 && `• 🛡️ ${hero.defense}`}
                  </span>
                </div>

                <HealthBar current={hero.hp} max={hero.maxHp} />

                <div
                  style={{
                    marginTop: '6px',
                    display: 'flex',
                    gap: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}
                >
                  {isDown && <span style={{ color: 'var(--warn)' }}>💀 Hors combat</span>}
                  {view.phase === 'combat' && hero.ready && !isDown && (
                    <span style={{ color: 'var(--ok)' }}>✅ Action prête</span>
                  )}
                  {view.turnHeroId === hero.id && !isDown && (
                    <span style={{ color: 'var(--accent)' }}>🎯 Tour en cours</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Salon d'attente (Lobby) */}
      {view.phase === 'lobby' && (
        <section className="panel" style={{ marginBottom: '16px' }}>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '1.15rem' }}>Salle de rassemblement</h2>
          <p className="muted" style={{ margin: '0 0 16px 0', fontSize: '0.9rem' }}>
            Partagez le lien de cette page avec vos alliés pour qu’ils rejoignent votre expédition.
          </p>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {!view.isMember && view.heroes.length < MAX_HEROES && (
              <button
                type="button"
                onClick={join}
                style={{ fontWeight: 600, background: 'var(--ok)', padding: '10px 18px' }}
              >
                Rejoindre l’expédition
              </button>
            )}

            {view.isHost && view.heroes.length < MAX_HEROES && (
              <button
                type="button"
                onClick={addCompanion}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'color-mix(in srgb, var(--accent) 30%, var(--panel))',
                  color: 'var(--ink)',
                  border: '1px solid color-mix(in srgb, var(--accent) 50%, transparent)',
                }}
              >
                <Entity kind="companion" /> Engager un mercenaire (bot)
              </button>
            )}

            {view.isHost && (
              <button
                type="button"
                onClick={start}
                style={{ fontWeight: 600, padding: '10px 18px' }}
              >
                Entrer dans le donjon
              </button>
            )}
          </div>

          {view.isMember && !view.isHost && (
            <p className="muted" style={{ marginTop: '12px', fontSize: '0.9rem' }}>
              ⏳ En attente que l’hôte déclenche l’entrée dans le donjon...
            </p>
          )}
        </section>
      )}

      {/* Exploration de la salle */}
      {view.phase === 'exploring' && (
        <section
          className="panel"
          style={{
            border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
            marginBottom: '16px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>
              🗝️ Exploration - Salle {view.room + 1} / {view.roomCount}
            </h2>
            {remaining !== null && (
              <span
                className="countdown"
                title="La porte s'ouvrira d'elle-même à l'échéance"
                style={{
                  padding: '3px 10px',
                  borderRadius: '16px',
                  background: 'color-mix(in srgb, var(--accent) 15%, var(--panel))',
                }}
              >
                ⏳ {remaining}s
              </span>
            )}
          </div>

          <p style={{ margin: '8px 0 16px 0', fontSize: '1rem', color: 'var(--ink)' }}>
            {view.currentRoom?.kind === 'treasure' && (
              <span>
                ✨ Vous découvrez un coffre contenant{' '}
                <strong>
                  <Entity kind="gold" /> {view.currentRoom.gold}
                </strong>{' '}
                !
              </span>
            )}
            {view.currentRoom?.kind === 'empty' && '🌫️ Cette salle est calme et déserte.'}
            <span style={{ marginLeft: '12px', color: 'var(--muted)', fontSize: '0.9rem' }}>
              (Butin amassé : <Entity kind="gold" /> {view.loot})
            </span>
          </p>

          {view.turnHeroId === userId ? (
            <button
              type="button"
              onClick={openDoor}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: 600,
                padding: '10px 18px',
              }}
            >
              <Entity kind="door" /> Ouvrir la porte suivante
            </button>
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
              C’est au tour de <strong>{nameOf(view.turnHeroId ?? '')}</strong> d’ouvrir la porte.
            </p>
          )}
        </section>
      )}

      {/* Raid de combat */}
      {view.phase === 'combat' && (
        <section
          className="panel"
          style={{
            border: '2px solid color-mix(in srgb, var(--warn) 30%, transparent)',
            marginBottom: '16px',
            background: 'color-mix(in srgb, var(--warn) 4%, var(--panel))',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
              paddingBottom: '8px',
              borderBottom: '1px solid color-mix(in srgb, var(--warn) 20%, transparent)',
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--warn)' }}>
                ⚔️ Combat de Raid - Salle {view.room + 1}
              </h2>
              <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                Manche {view.round} • Décidez de votre action
              </span>
            </div>
            {remaining !== null && (
              <span
                className="countdown"
                style={{
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  padding: '4px 12px',
                  borderRadius: '16px',
                  background: 'color-mix(in srgb, var(--warn) 18%, var(--panel))',
                  color: 'var(--warn)',
                }}
              >
                ⏱️ {remaining}s
              </span>
            )}
          </div>

          {/* Monstres ennemis */}
          <div style={{ marginBottom: '16px' }}>
            <h3
              style={{
                fontSize: '0.9rem',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: 'var(--muted)',
                marginBottom: '8px',
              }}
            >
              Ennemis affrontés :
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '10px',
              }}
            >
              {view.monsters.map((monster) => {
                const isDown = monster.hp <= 0
                return (
                  <div
                    key={monster.id}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      background: isDown
                        ? 'color-mix(in srgb, var(--muted) 15%, var(--panel))'
                        : 'color-mix(in srgb, var(--bg) 60%, var(--panel))',
                      border: '1px solid color-mix(in srgb, var(--warn) 25%, transparent)',
                      opacity: isDown ? 0.45 : 1,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <strong
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          color: 'var(--ink)',
                        }}
                      >
                        <Entity kind={monster.kind} /> {monsterName(monster, view.monsters)}
                      </strong>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                        {monster.hp}/{monster.maxHp} PV
                      </span>
                    </div>
                    <HealthBar current={monster.hp} max={monster.maxHp} />
                    {isDown && (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--muted)',
                          marginTop: '4px',
                          display: 'block',
                        }}
                      >
                        💀 Vaincu
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Actions de combat */}
          {me && me.hp > 0 && !me.action && (
            <div
              style={{
                marginTop: '16px',
                padding: '14px',
                borderRadius: '8px',
                background: 'color-mix(in srgb, var(--bg) 50%, var(--panel))',
                border: '1px solid color-mix(in srgb, var(--muted) 20%, transparent)',
              }}
            >
              <strong style={{ display: 'block', marginBottom: '8px', fontSize: '0.95rem' }}>
                Choisissez votre action pour cette manche :
              </strong>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {standingMonsters.map((monster) => (
                  <button
                    key={monster.id}
                    type="button"
                    onClick={() => act({ type: 'attack', target: monster.id })}
                    style={{
                      background: 'color-mix(in srgb, var(--warn) 90%, black)',
                      color: 'white',
                      fontWeight: 600,
                    }}
                  >
                    ⚔️ Attaquer {monsterName(monster, view.monsters)}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => act({ type: 'defend' })}
                  style={{
                    background: '#1e40af',
                    color: 'white',
                    fontWeight: 600,
                  }}
                >
                  🛡️ Se défendre
                </button>

                {standingHeroes.map((hero) => (
                  <button
                    key={hero.id}
                    type="button"
                    onClick={() => act({ type: 'heal', target: hero.id })}
                    style={{
                      background: 'var(--ok)',
                      color: 'white',
                      fontWeight: 600,
                    }}
                  >
                    💚 Soigner {hero.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {me?.action && (
            <div
              style={{
                marginTop: '12px',
                padding: '10px 14px',
                borderRadius: '6px',
                background: 'color-mix(in srgb, var(--ok) 12%, var(--panel))',
                border: '1px solid color-mix(in srgb, var(--ok) 25%, transparent)',
              }}
            >
              <span style={{ fontWeight: 600, color: 'var(--ok)' }}>✓ Action enregistrée :</span>{' '}
              {describeAction(me.action, nameOf)}. En attente des choix des autres aventuriers...
            </div>
          )}
        </section>
      )}

      {/* Fin de l'expédition (Victoire / Défaite) */}
      {(view.phase === 'won' || view.phase === 'lost') && (
        <section
          className="panel"
          style={{
            border:
              view.phase === 'won'
                ? '2px solid color-mix(in srgb, var(--ok) 40%, transparent)'
                : '2px solid color-mix(in srgb, var(--warn) 40%, transparent)',
            background:
              view.phase === 'won'
                ? 'color-mix(in srgb, var(--ok) 8%, var(--panel))'
                : 'color-mix(in srgb, var(--warn) 8%, var(--panel))',
            textAlign: 'center',
            padding: '24px',
            marginBottom: '16px',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '8px' }}>
            {view.phase === 'won' ? '🏆' : '💀'}
          </div>
          <h2 style={{ fontSize: '1.6rem', margin: '0 0 8px 0' }}>
            {view.phase === 'won'
              ? 'Victoire triomphale !'
              : 'Défaite... Tous les héros sont tombés'}
          </h2>

          <div
            style={{
              fontSize: '1.1rem',
              margin: '12px 0 16px 0',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>Butin total de l’expédition :</span>
            <strong style={{ fontSize: '1.3rem', color: 'var(--accent)' }}>
              <Entity kind="gold" /> {view.loot}
            </strong>
          </div>

          {view.phase === 'won' && (
            <div
              style={{
                padding: '12px',
                borderRadius: '8px',
                background: 'color-mix(in srgb, var(--ok) 15%, var(--panel))',
                maxWidth: '420px',
                margin: '0 auto 18px',
                fontSize: '0.95rem',
              }}
            >
              Partage équitable :{' '}
              <strong>
                Votre récompense versée au Village : <Entity kind="gold" /> {view.share}
              </strong>
            </div>
          )}

          <Link
            href="/dungeon"
            style={{
              display: 'inline-block',
              padding: '10px 20px',
              borderRadius: '8px',
              background: 'var(--accent)',
              color: 'white',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Retourner au salon du Donjon
          </Link>
        </section>
      )}

      {/* Journal de la dernière manche */}
      {view.lastRound && (
        <section className="panel" aria-label="Dernière manche">
          <h2 style={{ margin: '0 0 10px 0', fontSize: '1.1rem' }}>
            📜 Journal de combat (Manche {view.lastRound.round})
          </h2>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'grid',
              gap: '6px',
              fontSize: '0.85rem',
            }}
          >
            {Object.entries(view.lastRound.actions).map(([heroId, action]) => (
              <li
                key={heroId}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  background: 'color-mix(in srgb, var(--bg) 40%, var(--panel))',
                }}
              >
                <strong>{nameOf(heroId)}</strong> a choisi {ofVerb(describeAction(action, nameOf))}.
              </li>
            ))}
            {view.lastRound.effects.map((effect) => {
              const isDamage = effect.kind === 'damage'
              return (
                <li
                  key={`${effect.kind}-${effect.source}-${effect.target}`}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    background: isDamage
                      ? 'color-mix(in srgb, var(--warn) 10%, var(--panel))'
                      : 'color-mix(in srgb, var(--ok) 10%, var(--panel))',
                    borderLeft: isDamage ? '3px solid var(--warn)' : '3px solid var(--ok)',
                  }}
                >
                  {isDamage ? '💥 ' : '✨ '} {describeEffect(effect, nameOf)}.
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </main>
  )
}
