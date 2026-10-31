'use client'

import { hc } from 'hono/client'
import { useCallback, useEffect, useState } from 'react'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import type { RealmApi } from './api'
import {
  BUILDINGS,
  type Building,
  type DomainError,
  RESOURCES,
  type Stock,
  stockAt,
  type VillageView,
  villageChannel,
} from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<RealmApi>('/api/realm')

/** Erreurs que l'API peut renvoyer : erreurs métier et erreur de validation. */
type ApiError = { code: DomainError['code'] | 'INVALID_INPUT'; message?: string }

/** Message affiché au joueur pour chaque erreur. */
const ERRORS: Record<ApiError['code'], string> = {
  INVALID_INPUT: 'Saisie invalide.',
  ALREADY_FOUNDED: 'Village déjà fondé.',
  NOT_FOUNDED: 'Aucun village pour l’instant.',
  MAX_LEVEL_REACHED: 'Niveau maximum atteint.',
  INSUFFICIENT_RESOURCES: 'Ressources insuffisantes.',
}

/** Indique si le stock couvre un coût ; faux si le coût est absent (niveau maximal). */
function canAfford(stock: Stock, cost: Partial<Stock> | null) {
  return !!cost && Object.entries(cost).every(([r, n]) => stock[r as keyof Stock] >= (n ?? 0))
}

/** Libellé affiché pour chaque état de la connexion temps réel. */
const STATUS_LABELS = {
  connecting: 'Connexion...',
  open: 'Temps réel connecté',
  reconnecting: 'Reconnexion...',
} as const

/** Écran du Village : fondation, stock et bâtiments, mis à jour en temps réel. */
export function VillageScreen({ userId }: { userId: string }) {
  const [view, setView] = useState<VillageView | null | undefined>(undefined)
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await client.village.$get()
      if (res.ok) {
        setView((await res.json()).view)
        setError(null)
      } else {
        setError('Impossible de charger les informations du Village.')
      }
    } catch {
      setError('Erreur de connexion au Village.')
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const status = useChannel(villageChannel(userId), refresh)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [])

  async function found(name: string) {
    const res = await client.village.$post({ json: { name } })
    handle(await res.json())
  }

  async function upgrade(building: Building) {
    const res = await client.village.upgrade.$post({ json: { building } })
    handle(await res.json())
  }

  function handle(body: { view: VillageView } | { error: ApiError }) {
    if ('error' in body) {
      setError(ERRORS[body.error.code])
    } else {
      setError(null)
      setView(body.view)
    }
  }

  const title = (
    <div className="row" style={{ justifyContent: 'space-between', marginBottom: '16px' }}>
      <div>
        <h1 style={{ margin: 0 }}>
          <Entity kind="village" /> {view?.name ?? 'Royaumes'}
        </h1>
        <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.95rem' }}>
          Gestion du domaine seigneurial, récolte et développement des infrastructures
        </p>
      </div>
      <span className="status" data-status={status}>
        {STATUS_LABELS[status]}
      </span>
    </div>
  )

  if (view === undefined) {
    return (
      <main>
        {title}
        {error ? (
          <p className="error" style={{ margin: '1rem 0' }}>
            {error}
          </p>
        ) : (
          <p className="muted" style={{ margin: '1rem 0' }}>
            Chargement du village...
          </p>
        )}
      </main>
    )
  }

  // Aucun village : formulaire de fondation.
  if (view === null) {
    return (
      <main>
        {title}
        <div
          className="panel"
          style={{
            maxWidth: '460px',
            margin: '24px auto',
            padding: '24px',
            textAlign: 'center',
            border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>🏰</div>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '1.3rem' }}>Fondez votre premier village</h2>
          <p className="muted" style={{ margin: '0 0 20px 0', fontSize: '0.9rem' }}>
            Donnez un nom illustre à votre cité pour commencer à produire des ressources et bâtir
            votre royaume.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              found(String(new FormData(e.currentTarget).get('name')))
            }}
            style={{ maxWidth: '100%', margin: '0 auto' }}
          >
            <label
              htmlFor="name"
              style={{ textAlign: 'left', fontWeight: 600, fontSize: '0.9rem' }}
            >
              Nom de votre village :
            </label>
            <input
              id="name"
              name="name"
              required
              minLength={2}
              maxLength={30}
              placeholder="Ex : Haute-Roche, Val-Doré..."
              style={{ padding: '10px 12px', fontSize: '1rem' }}
            />
            <button
              type="submit"
              style={{ fontWeight: 600, padding: '10px 16px', marginTop: '6px' }}
            >
              Fonder le village
            </button>
            {error && (
              <p className="error" style={{ margin: '8px 0 0 0' }}>
                {error}
              </p>
            )}
          </form>
        </div>
      </main>
    )
  }

  // Village fondé : stock extrapolé à l'instant courant, puis bâtiments.
  const stock = stockAt(view, now)

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

      {/* Réserves et production en temps réel */}
      <section className="panel" aria-label="Ressources" style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.15rem' }}>🌾 Réserves du Royaume</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
          }}
        >
          {RESOURCES.map((r) => {
            const rate = view.ratesPerMinute[r]
            return (
              <div
                key={r}
                style={{
                  padding: '14px',
                  borderRadius: '8px',
                  background: 'color-mix(in srgb, var(--bg) 50%, var(--panel))',
                  border: '1px solid color-mix(in srgb, var(--muted) 20%, transparent)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '6px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--ink)' }}>
                    <Entity kind={r} showLabel />
                  </span>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '2px 6px',
                      borderRadius: '12px',
                      background: 'color-mix(in srgb, var(--ok) 15%, var(--panel))',
                      color: 'var(--ok)',
                    }}
                  >
                    +{rate} / min
                  </span>
                </div>

                <div
                  style={{
                    fontSize: '1.9rem',
                    fontWeight: 700,
                    color: 'var(--ink)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {Math.floor(stock[r])}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Bâtiments du village */}
      <section className="panel" aria-label="Bâtiments">
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.15rem' }}>🏛️ Bâtiments du domaine</h2>
        <div style={{ display: 'grid', gap: '10px' }}>
          {BUILDINGS.map((b) => {
            const cost = view.nextCosts[b]
            const level = view.levels[b]
            const affordable = canAfford(stock, cost)
            return (
              <div
                key={b}
                style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: 'color-mix(in srgb, var(--bg) 45%, var(--panel))',
                  border: '1px solid color-mix(in srgb, var(--muted) 20%, transparent)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '1rem',
                      fontWeight: 600,
                    }}
                  >
                    <Entity kind={b} showLabel />
                    <span
                      style={{
                        fontSize: '0.8rem',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        background: 'color-mix(in srgb, var(--accent) 18%, var(--panel))',
                        color: 'var(--accent)',
                        fontWeight: 600,
                      }}
                    >
                      Niveau {level}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  {cost && (
                    <div
                      style={{
                        display: 'flex',
                        gap: '8px',
                        fontSize: '0.85rem',
                        color: 'var(--muted)',
                      }}
                    >
                      Coût :
                      {Object.entries(cost).map(([r, n]) => (
                        <span
                          key={r}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontWeight: 600,
                            color:
                              stock[r as keyof Stock] >= (n ?? 0) ? 'var(--ink)' : 'var(--warn)',
                          }}
                        >
                          <Entity kind={r} /> {n}
                        </span>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={!affordable}
                    onClick={() => upgrade(b)}
                    style={{
                      fontWeight: 600,
                      padding: '8px 14px',
                      fontSize: '0.9rem',
                    }}
                  >
                    {level === 0 ? 'Construire' : `Améliorer (Niv. ${level + 1})`}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </main>
  )
}
