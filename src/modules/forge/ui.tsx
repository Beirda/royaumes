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
      }
    } catch {
      // Erreur réseau temporaire ignorée en arrière-plan
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

  return (
    <main className="container">
      <header className="page-header">
        <h1>
          <Entity kind="forge" /> La Forge
        </h1>
        <p className="status" aria-live="polite">
          {STATUS_LABELS[status]}
        </p>
      </header>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {/* Profil de combat et statistiques du héros */}
      {data?.stats && (
        <section
          className="card"
          style={{
            marginBottom: '2rem',
            background: 'linear-gradient(to bottom right, #fbfbfb, #f3f4f6)',
            border: '2px solid var(--border-color, #d1d5db)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>⚔️ Caractéristiques du Héros</h2>
            <span
              style={{
                fontSize: '0.9rem',
                fontWeight: 'bold',
                padding: '0.25rem 0.75rem',
                borderRadius: '16px',
                background: data.stats.itemsCount > 0 ? '#dcfce7' : '#f3f4f6',
                color: data.stats.itemsCount > 0 ? '#166534' : '#6b7280',
                border: '1px solid currentColor',
              }}
            >
              {data.stats.itemsCount} équipement{data.stats.itemsCount > 1 ? 's' : ''} actif
              {data.stats.itemsCount > 1 ? 's' : ''}
            </span>
          </div>
          <p className="muted" style={{ margin: '0.25rem 0 1.25rem 0' }}>
            Vos équipements forgés renforcent directement vos dégâts, votre défense et votre
            vitalité dans les expéditions du Donjon.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1rem',
            }}
          >
            {/* Dégâts / Attaque */}
            <div
              style={{
                padding: '1rem',
                borderRadius: '8px',
                background: '#fff',
                border: '1px solid #e5e7eb',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <div style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 'bold' }}>
                ⚔️ ATTAQUE / DÉGÂTS
              </div>
              <div
                style={{
                  fontSize: '2rem',
                  fontWeight: 'bold',
                  color: '#b91c1c',
                  margin: '0.25rem 0',
                }}
              >
                {data.stats.total.attack}{' '}
                <span style={{ fontSize: '0.9rem', color: '#16a34a' }}>
                  (+{data.stats.bonus.attack})
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                Base : {data.stats.base.attack} • Équipement : +{data.stats.bonus.attack}
              </div>
            </div>

            {/* Défense */}
            <div
              style={{
                padding: '1rem',
                borderRadius: '8px',
                background: '#fff',
                border: '1px solid #e5e7eb',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <div style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 'bold' }}>
                🛡️ DÉFENSE DU HÉROS
              </div>
              <div
                style={{
                  fontSize: '2rem',
                  fontWeight: 'bold',
                  color: '#1d4ed8',
                  margin: '0.25rem 0',
                }}
              >
                {data.stats.total.defense}{' '}
                <span style={{ fontSize: '0.9rem', color: '#16a34a' }}>
                  (+{data.stats.bonus.defense})
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                Réduit tous les dégâts subis de {data.stats.total.defense}
              </div>
            </div>

            {/* Points de vie */}
            <div
              style={{
                padding: '1rem',
                borderRadius: '8px',
                background: '#fff',
                border: '1px solid #e5e7eb',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <div style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 'bold' }}>
                ❤️ POINTS DE VIE (PV)
              </div>
              <div
                style={{
                  fontSize: '2rem',
                  fontWeight: 'bold',
                  color: '#047857',
                  margin: '0.25rem 0',
                }}
              >
                {data.stats.total.hp}{' '}
                <span style={{ fontSize: '0.9rem', color: '#16a34a' }}>
                  (+{data.stats.bonus.hp})
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                Base : {data.stats.base.hp} • Équipement : +{data.stats.bonus.hp}
              </div>
            </div>

            {/* Rendement du Village (outils de récolte) */}
            {Boolean(
              data.stats.productionBonus?.wood ||
                data.stats.productionBonus?.stone ||
                data.stats.productionBonus?.gold,
            ) && (
              <div
                style={{
                  padding: '1rem',
                  borderRadius: '8px',
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                }}
              >
                <div style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 'bold' }}>
                  ⛏️ RENDEMENT DU VILLAGE
                </div>
                <div
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 'bold',
                    color: '#7c3aed',
                    margin: '0.25rem 0',
                  }}
                >
                  {data.stats.productionBonus.wood
                    ? `+${data.stats.productionBonus.wood} bois `
                    : ''}
                  {data.stats.productionBonus.stone
                    ? `+${data.stats.productionBonus.stone} pierre `
                    : ''}
                  {data.stats.productionBonus.gold ? `+${data.stats.productionBonus.gold} or ` : ''}
                  <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>/ min</span>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                  Bonus cumulé de vos outils de forge
                </div>
              </div>
            )}
          </div>

          {/* Effets spéciaux actifs */}
          {data.stats.specialEffects.length > 0 && (
            <div
              style={{
                marginTop: '1rem',
                padding: '0.75rem',
                background: '#fef3c7',
                borderRadius: '6px',
              }}
            >
              <strong style={{ fontSize: '0.85rem', color: '#92400e' }}>
                ✨ Effets passifs actifs :
              </strong>
              <ul
                style={{
                  margin: '0.5rem 0 0 1.25rem',
                  padding: 0,
                  fontSize: '0.85rem',
                  color: '#78350f',
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

      {/* Recettes disponibles */}
      <section className="card" style={{ marginBottom: '2rem' }}>
        <h2>Catalogue des recettes</h2>
        <p className="muted">
          Commandez la confection d’objets en utilisant les ressources produites par votre Village.
        </p>

        <div className="recipes-grid" style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
          {data?.recipes.map((recipe: Recipe) => (
            <article
              key={recipe.id}
              style={{
                border: '1px solid var(--border-color, #ccc)',
                borderRadius: '8px',
                padding: '1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ flex: 1, marginRight: '1rem' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '0.25rem',
                  }}
                >
                  <h3 style={{ margin: 0 }}>
                    <Entity kind={recipe.id} /> {recipe.name}
                  </h3>
                  <span
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 'bold',
                      padding: '0.15rem 0.5rem',
                      borderRadius: '4px',
                      background: '#dcfce7',
                      color: '#15803d',
                      border: '1px solid #bbf7d0',
                    }}
                  >
                    {recipe.effect.label}
                  </span>
                </div>
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>{recipe.description}</p>
                <p style={{ margin: 0, fontSize: '0.85rem' }} className="muted">
                  Coût : <AmountsText amounts={recipe.cost} /> • Durée : {recipe.durationMs / 1000}s
                </p>
              </div>

              <button
                type="button"
                className="button primary"
                disabled={loading}
                onClick={() => handleCraft(recipe.id)}
              >
                Fabriquer
              </button>
            </article>
          ))}
        </div>
      </section>

      {/* Confections en cours */}
      <section className="card" style={{ marginBottom: '2rem' }}>
        <h2>Atelier de confection</h2>
        {data?.crafts.length === 0 ? (
          <p className="muted">Aucune confection en cours. Choisissez une recette ci-dessus.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '1rem 0' }}>
            {data?.crafts.map((craft: ForgeCraftSummary) => {
              const remainingMs = Math.max(0, craft.readyAt - now)
              const isReady =
                craft.isReady || (craft.status === 'in_progress' && now >= craft.readyAt)
              return (
                <li
                  key={craft.craftId}
                  style={{
                    borderBottom: '1px solid var(--border-color, #eee)',
                    padding: '0.75rem 0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <strong>
                      <Entity kind={craft.recipeId} /> {craft.recipeName}
                    </strong>
                    <div style={{ fontSize: '0.85rem' }} className="muted">
                      {craft.status === 'reserving' && 'Réservation des ressources au Village...'}
                      {craft.status === 'in_progress' &&
                        !isReady &&
                        `En cours de forge (${Math.ceil(remainingMs / 1000)}s restantes)`}
                      {isReady && '✅ Forgé et prêt à être récupéré !'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {isReady ? (
                      <button
                        type="button"
                        className="button success"
                        disabled={loading}
                        onClick={() => handleClaim(craft.craftId)}
                      >
                        Récupérer
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="button link"
                        disabled={loading}
                        onClick={() => handleCancel(craft.craftId)}
                      >
                        Annuler (rembourser)
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Inventaire des objets forgés */}
      <section className="card">
        <h2>Inventaire des équipements</h2>
        {data?.inventory.length === 0 ? (
          <p className="muted">Votre inventaire est vide pour le moment.</p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: '1rem',
              marginTop: '1rem',
            }}
          >
            {data?.inventory.map((item: ForgeCraftSummary) => {
              const recipe = data?.recipes.find((r) => r.id === item.recipeId)
              return (
                <div
                  key={item.craftId}
                  style={{
                    border: '1px solid var(--border-color, #ddd)',
                    borderRadius: '8px',
                    padding: '1rem',
                    textAlign: 'center',
                    background: '#fff',
                  }}
                >
                  <div style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>
                    <Entity kind={item.recipeId} />
                  </div>
                  <strong>{item.recipeName}</strong>
                  {recipe?.effect && (
                    <div
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        color: item.isExpired ? '#9ca3af' : '#15803d',
                        marginTop: '0.25rem',
                      }}
                    >
                      {recipe.effect.label}
                    </div>
                  )}

                  {/* Durabilité de combat et/ou Temps de rendement restant */}
                  <div
                    style={{
                      marginTop: '0.5rem',
                      fontSize: '0.75rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.25rem',
                    }}
                  >
                    {Boolean(
                      recipe?.effect.attack || recipe?.effect.defense || recipe?.effect.hp,
                    ) && (
                      <div>
                        {item.raidsRemaining > 0 ? (
                          <span style={{ color: '#16a34a', fontWeight: 'bold' }}>
                            ⚔️ {item.raidsRemaining}/2 raid{item.raidsRemaining > 1 ? 's' : ''}{' '}
                            restant{item.raidsRemaining > 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span style={{ color: '#dc2626', fontWeight: 'bold' }}>
                            💥 Combat épuisé (2/2 raids faits)
                          </span>
                        )}
                      </div>
                    )}
                    {Boolean(recipe?.effect.production) && (
                      <div>
                        {item.expiresAt && now > item.expiresAt ? (
                          <span style={{ color: '#dc2626', fontWeight: 'bold' }}>
                            ❌ Rendement expiré (15 min)
                          </span>
                        ) : (
                          <span style={{ color: '#2563eb', fontWeight: 'bold' }}>
                            ⏳ Rendement actif (~
                            {Math.max(
                              1,
                              Math.ceil((item.expiresAt ? item.expiresAt - now : 0) / 60_000),
                            )}{' '}
                            min)
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ fontSize: '0.75rem', marginTop: '0.25rem' }} className="muted">
                    Forgé le {new Date(item.completedAt ?? item.readyAt).toLocaleTimeString()}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}
