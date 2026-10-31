'use client'

import { hc } from 'hono/client'
import { useCallback, useEffect, useState } from 'react'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import type { ForgeApi } from './api'
import {
  type Amounts,
  FORGE_CHANNEL,
  type ForgeCraftSummary,
  type ForgeOverview,
  type Recipe,
  type RecipeId,
} from './contracts'

const client = hc<ForgeApi>('/api/forge')

const STATUS_LABELS = {
  connecting: 'Connexion...',
  open: 'Temps réel connecté',
  reconnecting: 'Reconnexion...',
} as const

function AmountsText({ amounts }: { amounts: Amounts }) {
  return (
    <>
      {Object.entries(amounts).map(([resource, amount], index) => (
        <span key={resource}>
          {index > 0 && ', '}
          {amount} <Entity kind={resource} />
        </span>
      ))}
    </>
  )
}

export function ForgeScreen() {
  const [data, setData] = useState<ForgeOverview | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const res = await client.index.$get()
      if (res.ok) {
        const overview = await res.json()
        setData(overview)
        setError(null)
      } else {
        setError('Impossible de charger les données de la Forge.')
      }
    } catch {
      setError('Erreur de connexion à la Forge.')
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Abonnement au canal temps réel pour rafraîchir la forge
  const status = useChannel(FORGE_CHANNEL, loadData)

  async function handleCraft(recipeId: RecipeId) {
    setError(null)
    setLoading(true)
    try {
      const res = await client.crafts.$post({ json: { recipeId } })
      if (!res.ok) {
        const payload = (await res.json()) as { error?: { code?: string } }
        if (payload.error?.code === 'UNKNOWN_RECIPE') {
          setError('Recette inconnue.')
        } else {
          setError('Impossible de lancer la confection.')
        }
      } else {
        await loadData()
      }
    } catch {
      setError('Erreur réseau lors de la commande.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel(craftId: string) {
    setError(null)
    setLoading(true)
    try {
      const res = await client.crafts[':id'].cancel.$post({ param: { id: craftId } })
      if (!res.ok) {
        setError('Impossible d’annuler cette confection.')
      } else {
        await loadData()
      }
    } catch {
      setError('Erreur réseau lors de l’annulation.')
    } finally {
      setLoading(false)
    }
  }

  async function handleClaim(craftId: string) {
    setError(null)
    setLoading(true)
    try {
      const res = await client.crafts[':id'].claim.$post({ param: { id: craftId } })
      if (!res.ok) {
        setError('L’objet n’est pas encore prêt.')
      } else {
        await loadData()
      }
    } catch {
      setError('Erreur réseau lors de la récupération.')
    } finally {
      setLoading(false)
    }
  }

  // Filtrage des équipements actifs : les objets complètement épuisés disparaissent
  const activeInventory = (data?.inventory ?? []).filter((item: ForgeCraftSummary) => {
    const recipe = data?.recipes.find((r) => r.id === item.recipeId)
    const hasCombat = Boolean(recipe?.effect.attack || recipe?.effect.defense || recipe?.effect.hp)
    const hasProduction = Boolean(recipe?.effect.production)

    const combatExpired = hasCombat ? item.raidsRemaining <= 0 : true
    const toolExpired = hasProduction
      ? item.expiresAt !== null
        ? now > item.expiresAt
        : false
      : true

    return !(combatExpired && toolExpired)
  })

  return (
    <main>
      {/* En-tête */}
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <h1>
            <Entity kind="forge" /> La Forge
          </h1>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.95rem' }}>
            Atelier de métallurgie & confection d’équipements pour le Donjon et le Village
          </p>
        </div>
        <span className="status" data-status={status}>
          {STATUS_LABELS[status]}
        </span>
      </div>

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

      {!data && !error && (
        <p className="muted" style={{ margin: '2rem 0' }}>
          Chargement de l’atelier de la Forge...
        </p>
      )}

      {/* Profil de combat et caractéristiques du héros */}
      {data?.stats && (
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
              flexWrap: 'wrap',
              gap: '8px',
              marginBottom: '10px',
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: '1.2rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              ⚔️ Caractéristiques du Héros
            </h2>
            <span
              style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: '20px',
                background:
                  data.stats.itemsCount > 0
                    ? 'color-mix(in srgb, var(--ok) 18%, var(--panel))'
                    : 'color-mix(in srgb, var(--muted) 15%, var(--panel))',
                color: data.stats.itemsCount > 0 ? 'var(--ok)' : 'var(--muted)',
                border: '1px solid currentColor',
              }}
            >
              {data.stats.itemsCount} équipement{data.stats.itemsCount > 1 ? 's' : ''} actif
              {data.stats.itemsCount > 1 ? 's' : ''}
            </span>
          </div>
          <p className="muted" style={{ margin: '0 0 16px 0', fontSize: '0.85rem' }}>
            Vos équipements forgés renforcent directement vos dégâts, votre défense et votre
            vitalité dans les expéditions du Donjon.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '12px',
            }}
          >
            {/* Attaque */}
            <div
              style={{
                padding: '12px',
                borderRadius: '8px',
                background: 'color-mix(in srgb, var(--bg) 60%, var(--panel))',
                border: '1px solid color-mix(in srgb, var(--muted) 20%, transparent)',
              }}
            >
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--muted)',
                  letterSpacing: '0.5px',
                }}
              >
                ⚔️ ATTAQUE
              </div>
              <div
                style={{
                  fontSize: '1.8rem',
                  fontWeight: 700,
                  color: 'var(--ink)',
                  margin: '4px 0 2px',
                }}
              >
                {data.stats.total.attack}{' '}
                {data.stats.bonus.attack > 0 && (
                  <span style={{ fontSize: '0.85rem', color: 'var(--ok)', fontWeight: 600 }}>
                    (+{data.stats.bonus.attack})
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                Base : {data.stats.base.attack} • Forge : +{data.stats.bonus.attack}
              </div>
            </div>

            {/* Défense */}
            <div
              style={{
                padding: '12px',
                borderRadius: '8px',
                background: 'color-mix(in srgb, var(--bg) 60%, var(--panel))',
                border: '1px solid color-mix(in srgb, var(--muted) 20%, transparent)',
              }}
            >
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--muted)',
                  letterSpacing: '0.5px',
                }}
              >
                🛡️ DÉFENSE
              </div>
              <div
                style={{
                  fontSize: '1.8rem',
                  fontWeight: 700,
                  color: 'var(--ink)',
                  margin: '4px 0 2px',
                }}
              >
                {data.stats.total.defense}{' '}
                {data.stats.bonus.defense > 0 && (
                  <span style={{ fontSize: '0.85rem', color: 'var(--ok)', fontWeight: 600 }}>
                    (+{data.stats.bonus.defense})
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                Réduit tous dégâts de {data.stats.total.defense}
              </div>
            </div>

            {/* PV */}
            <div
              style={{
                padding: '12px',
                borderRadius: '8px',
                background: 'color-mix(in srgb, var(--bg) 60%, var(--panel))',
                border: '1px solid color-mix(in srgb, var(--muted) 20%, transparent)',
              }}
            >
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--muted)',
                  letterSpacing: '0.5px',
                }}
              >
                ❤️ VITALITÉ (PV)
              </div>
              <div
                style={{
                  fontSize: '1.8rem',
                  fontWeight: 700,
                  color: 'var(--ink)',
                  margin: '4px 0 2px',
                }}
              >
                {data.stats.total.hp}{' '}
                {data.stats.bonus.hp > 0 && (
                  <span style={{ fontSize: '0.85rem', color: 'var(--ok)', fontWeight: 600 }}>
                    (+{data.stats.bonus.hp})
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                Base : {data.stats.base.hp} • Forge : +{data.stats.bonus.hp}
              </div>
            </div>

            {/* Rendement Village */}
            {Boolean(
              data.stats.productionBonus?.wood ||
                data.stats.productionBonus?.stone ||
                data.stats.productionBonus?.gold,
            ) && (
              <div
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  background: 'color-mix(in srgb, var(--accent) 10%, var(--panel))',
                  border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                }}
              >
                <div
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--accent)',
                    letterSpacing: '0.5px',
                  }}
                >
                  ⛏️ RENDEMENT VILLAGE
                </div>
                <div
                  style={{
                    fontSize: '1.15rem',
                    fontWeight: 700,
                    color: 'var(--accent)',
                    margin: '6px 0 2px',
                  }}
                >
                  {data.stats.productionBonus.wood
                    ? `+${data.stats.productionBonus.wood} bois `
                    : ''}
                  {data.stats.productionBonus.stone
                    ? `+${data.stats.productionBonus.stone} pierre `
                    : ''}
                  {data.stats.productionBonus.gold ? `+${data.stats.productionBonus.gold} or ` : ''}
                  <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>/ min</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                  Actif sur votre domaine
                </div>
              </div>
            )}
          </div>

          {/* Effets spéciaux actifs */}
          {data.stats.specialEffects.length > 0 && (
            <div
              style={{
                marginTop: '14px',
                padding: '10px 14px',
                background: 'color-mix(in srgb, var(--accent) 12%, var(--panel))',
                borderRadius: '8px',
                border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
              }}
            >
              <strong
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--accent)',
                  display: 'block',
                  marginBottom: '4px',
                }}
              >
                ✨ Effets passifs actifs :
              </strong>
              <ul
                style={{
                  margin: '0 0 0 18px',
                  padding: 0,
                  fontSize: '0.85rem',
                  color: 'var(--ink)',
                }}
              >
                {data.stats.specialEffects.map((effect) => (
                  <li key={effect}>{effect}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Atelier de confection */}
      <section className="panel" style={{ marginBottom: '16px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>🔨 Atelier de confection</h2>
          {data?.crafts && data.crafts.length > 0 && (
            <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
              {data.crafts.length} en cours
            </span>
          )}
        </div>
        {!data || data.crafts.length === 0 ? (
          <p className="muted" style={{ margin: '8px 0' }}>
            Aucune confection en cours. Choisissez une recette ci-dessous pour lancer la forge.
          </p>
        ) : (
          <ul
            style={{ listStyle: 'none', padding: 0, margin: '8px 0', display: 'grid', gap: '8px' }}
          >
            {data.crafts.map((craft: ForgeCraftSummary) => {
              const remainingMs = Math.max(0, craft.readyAt - now)
              const isReady =
                craft.isReady || (craft.status === 'in_progress' && now >= craft.readyAt)
              return (
                <li
                  key={craft.craftId}
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, var(--bg) 50%, var(--panel))',
                    border: '1px solid color-mix(in srgb, var(--muted) 20%, transparent)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <Entity kind={craft.recipeId} /> {craft.recipeName}
                    </div>
                    <div style={{ fontSize: '0.85rem', marginTop: '2px' }} className="muted">
                      {craft.status === 'reserving' &&
                        '⏳ Réservation des ressources au Village...'}
                      {craft.status === 'in_progress' &&
                        !isReady &&
                        `🔥 En cours de forge (${Math.ceil(remainingMs / 1000)}s restantes)`}
                      {isReady && (
                        <span style={{ color: 'var(--ok)', fontWeight: 600 }}>
                          ✅ Forgé et prêt à être récupéré !
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    {isReady ? (
                      <button
                        type="button"
                        style={{
                          background: 'var(--ok)',
                          fontWeight: 600,
                          padding: '8px 16px',
                        }}
                        disabled={loading}
                        onClick={() => handleClaim(craft.craftId)}
                      >
                        Récupérer
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="link"
                        disabled={loading}
                        onClick={() => handleCancel(craft.craftId)}
                      >
                        Annuler & rembourser
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Inventaire des équipements actifs */}
      <section className="panel" style={{ marginBottom: '16px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>🎒 Inventaire actif</h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            {activeInventory.length} objet{activeInventory.length > 1 ? 's' : ''} actif
            {activeInventory.length > 1 ? 's' : ''}
          </span>
        </div>

        {activeInventory.length === 0 ? (
          <p className="muted" style={{ margin: '8px 0', padding: '12px 0' }}>
            Votre inventaire est vide pour le moment. Dès qu’un outil ou équipement est complètement
            épuisé (raids et durée de récolte), il disparaît automatiquement.
          </p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '12px',
              marginTop: '12px',
            }}
          >
            {activeInventory.map((item: ForgeCraftSummary) => {
              const recipe = data?.recipes.find((r) => r.id === item.recipeId)
              const hasCombat = Boolean(
                recipe?.effect.attack || recipe?.effect.defense || recipe?.effect.hp,
              )
              const hasProduction = Boolean(recipe?.effect.production)

              return (
                <div
                  key={item.craftId}
                  style={{
                    borderRadius: '8px',
                    padding: '14px',
                    textAlign: 'center',
                    background: 'color-mix(in srgb, var(--bg) 40%, var(--panel))',
                    border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                    boxShadow: '0 1px 3px rgb(0 0 0 / 0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: '2rem',
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        background: 'color-mix(in srgb, var(--accent) 15%, var(--panel))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 8px',
                      }}
                    >
                      <Entity kind={item.recipeId} />
                    </div>
                    <strong style={{ fontSize: '1rem', color: 'var(--ink)' }}>
                      {item.recipeName}
                    </strong>
                    {recipe?.effect && (
                      <div
                        style={{
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          color: 'var(--ok)',
                          margin: '4px 0 8px',
                        }}
                      >
                        {recipe.effect.label}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      marginTop: '8px',
                    }}
                  >
                    {hasCombat && item.raidsRemaining > 0 && (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          background: 'color-mix(in srgb, var(--ok) 15%, var(--panel))',
                          color: 'var(--ok)',
                          border: '1px solid color-mix(in srgb, var(--ok) 30%, transparent)',
                        }}
                      >
                        ⚔️ {item.raidsRemaining}/2 raid{item.raidsRemaining > 1 ? 's' : ''} restant
                        {item.raidsRemaining > 1 ? 's' : ''}
                      </span>
                    )}
                    {hasProduction && (!item.expiresAt || now <= item.expiresAt) && (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          background: 'color-mix(in srgb, var(--accent) 15%, var(--panel))',
                          color: 'var(--accent)',
                          border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                        }}
                      >
                        ⏳ Rendement actif (~
                        {Math.max(
                          1,
                          Math.ceil((item.expiresAt ? item.expiresAt - now : 0) / 60_000),
                        )}{' '}
                        min)
                      </span>
                    )}
                    <div style={{ fontSize: '0.75rem', marginTop: '4px' }} className="muted">
                      Forgé le{' '}
                      {new Date(item.completedAt ?? item.readyAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Catalogue des recettes */}
      <section className="panel">
        <div style={{ marginBottom: '12px' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>📜 Catalogue des recettes</h2>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
            Commandez la confection d’équipements grâce aux ressources récoltées par votre Village.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '12px',
          }}
        >
          {data?.recipes.map((recipe: Recipe) => (
            <article
              key={recipe.id}
              style={{
                borderRadius: '8px',
                padding: '14px',
                background: 'color-mix(in srgb, var(--bg) 40%, var(--panel))',
                border: '1px solid color-mix(in srgb, var(--muted) 20%, transparent)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '10px',
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '8px',
                    marginBottom: '6px',
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      fontSize: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Entity kind={recipe.id} /> {recipe.name}
                  </h3>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: 'color-mix(in srgb, var(--ok) 15%, var(--panel))',
                      color: 'var(--ok)',
                      border: '1px solid color-mix(in srgb, var(--ok) 30%, transparent)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {recipe.effect.label}
                  </span>
                </div>
                <p style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: 'var(--ink)' }}>
                  {recipe.description}
                </p>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: '8px',
                  borderTop: '1px solid color-mix(in srgb, var(--muted) 15%, transparent)',
                  gap: '8px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ fontSize: '0.8rem' }} className="muted">
                  <div>
                    Coût : <AmountsText amounts={recipe.cost} />
                  </div>
                  <div>Durée : {recipe.durationMs / 1000}s</div>
                </div>

                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleCraft(recipe.id)}
                  style={{
                    padding: '6px 14px',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                  }}
                >
                  Fabriquer
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
