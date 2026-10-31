'use client'

import { hc } from 'hono/client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { RESOURCES, type Resource } from '@/modules/realm/contracts'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import { look } from '@/ui/theme'
import type { MarketApi } from './api'
import {
  type Amounts,
  MARKET_CHANNEL,
  type MarketList,
  type OfferError,
  type OfferStatus,
  type OfferView,
} from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<MarketApi>('/api/market')

/** Libellé affiché pour chaque état de la connexion temps réel. */
const STATUS_LABELS = {
  connecting: 'Connexion...',
  open: 'Temps réel connecté',
  reconnecting: 'Reconnexion...',
} as const

/** Libellé de chaque état d'une offre. */
const OFFER_STATUS: Record<OfferStatus, string> = {
  reserving: 'Réservation en cours',
  open: 'Disponible',
  settling: 'Règlement en cours',
  completed: 'Échange conclu',
  rejected: 'Refusée (stock insuffisant)',
  withdrawn: 'Retirée',
}

/** Message affiché au joueur pour chaque erreur. */
const ERRORS: Record<OfferError['code'] | 'INVALID_INPUT', string> = {
  INVALID_INPUT: 'Saisie invalide.',
  OFFER_NOT_FOUND: 'Offre introuvable.',
  ALREADY_EXISTS: 'Offre déjà publiée.',
  NOT_OPEN: 'L’offre n’est plus disponible.',
  OWN_OFFER: 'Vous ne pouvez pas accepter votre propre offre.',
  NOT_SELLER: 'Seul le vendeur peut retirer son offre.',
  EXPIRED: 'L’offre a expiré.',
  NOT_EXPIRED: 'L’offre n’a pas expiré.',
}

const RETRY_MS = 1_000
const MAX_READS = 10

function AmountsText({ amounts }: { amounts: Amounts }) {
  return (
    <>
      {Object.entries(amounts).map(([resource, amount], index) => (
        <span key={resource} style={{ fontWeight: 600 }}>
          {index > 0 && ', '}
          {amount} <Entity kind={resource} />
        </span>
      ))}
    </>
  )
}

function outcomeOf(view: OfferView): string {
  if (view.missing && view.status === 'open') {
    const missing = Object.entries(view.missing)
      .map(([resource, amount]) => `${amount} ${look(resource).label.toLowerCase()}`)
      .join(', ')
    return `Paiement refusé : il vous manque ${missing}.`
  }
  return OFFER_STATUS[view.status]
}

/** Écran du Marché : publication d'une offre, offres du joueur et offres des autres joueurs. */
export function MarketScreen() {
  const [list, setList] = useState<MarketList | undefined>(undefined)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [loading, setLoading] = useState(false)

  const [give, setGive] = useState<{ resource: Resource; amount: number }>({
    resource: 'wood',
    amount: 50,
  })
  const [want, setWant] = useState<{ resource: Resource; amount: number }>({
    resource: 'stone',
    amount: 25,
  })

  const refresh = useCallback(async () => {
    const res = await client.offers.$get()
    if (!res.ok) return 0
    const body = await res.json()
    setList(body)
    return body.position
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const wanted = useRef(0)
  const following = useRef(false)

  const follow = useCallback(
    async (position: number) => {
      wanted.current = Math.max(wanted.current, position)
      if (following.current) return
      following.current = true
      try {
        for (let read = 0; read < MAX_READS; read++) {
          if ((await refresh()) >= wanted.current) return
          await new Promise((resolve) => setTimeout(resolve, RETRY_MS))
        }
      } finally {
        following.current = false
      }
    },
    [refresh],
  )

  const status = useChannel(MARKET_CHANNEL, (event) => follow(event.position))

  async function publish() {
    setLoading(true)
    setMessage(null)
    try {
      const res = await client.offers.$post({
        json: {
          give: { [give.resource]: give.amount },
          want: { [want.resource]: want.amount },
        },
      })
      const body = await res.json()
      if ('error' in body) {
        setMessage({ text: ERRORS[body.error.code], error: true })
      } else {
        setMessage({ text: outcomeOf(body.view), error: false })
        await refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  async function acceptOffer(offerId: string) {
    setLoading(true)
    setMessage(null)
    try {
      const res = await client.offers[':id'].accept.$post({ param: { id: offerId } })
      const body = await res.json()
      if ('error' in body) {
        setMessage({ text: ERRORS[body.error.code], error: true })
      } else {
        setMessage({ text: outcomeOf(body.view), error: false })
        await refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  async function withdrawOffer(offerId: string) {
    setLoading(true)
    setMessage(null)
    try {
      const res = await client.offers[':id'].withdraw.$post({ param: { id: offerId } })
      const body = await res.json()
      if ('error' in body) {
        setMessage({ text: ERRORS[body.error.code], error: true })
      } else {
        setMessage({ text: outcomeOf(body.view), error: false })
        await refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  const mine = list?.offers.filter((offer) => offer.mine) ?? []
  const others = list?.offers.filter((offer) => !offer.mine && offer.status === 'open') ?? []

  const picker = (
    label: string,
    value: { resource: Resource; amount: number },
    onChange: (value: { resource: Resource; amount: number }) => void,
  ) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <label htmlFor={`${label}-amount`} style={{ fontWeight: 600, fontSize: '0.9rem' }}>
        {label} :
      </label>
      <input
        id={`${label}-amount`}
        className="amount"
        type="number"
        min={1}
        value={value.amount}
        onChange={(e) => onChange({ ...value, amount: Math.max(1, Number(e.target.value)) })}
        style={{
          width: '5.5em',
          padding: '6px 8px',
          borderRadius: '6px',
          border: '1px solid color-mix(in srgb, var(--muted) 40%, transparent)',
          background: 'var(--panel)',
          color: 'var(--ink)',
          font: 'inherit',
        }}
      />
      <select
        aria-label={`Ressource : ${label}`}
        value={value.resource}
        onChange={(e) => onChange({ ...value, resource: e.target.value as Resource })}
        style={{
          padding: '6px 10px',
          borderRadius: '6px',
          border: '1px solid color-mix(in srgb, var(--muted) 40%, transparent)',
          background: 'var(--panel)',
          color: 'var(--ink)',
          font: 'inherit',
        }}
      >
        {RESOURCES.map((resource) => (
          <option key={resource} value={resource}>
            {look(resource).label}
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <main>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <h1 style={{ margin: 0 }}>
            <Entity kind="market" /> Comptoir du Marché
          </h1>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.95rem' }}>
            Négociez des surplus de ressources avec les autres seigneurs du royaume
          </p>
        </div>
        <span className="status" data-status={status}>
          {STATUS_LABELS[status]}
        </span>
      </div>

      {/* Publier une offre */}
      <section
        className="panel"
        style={{
          border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
          marginBottom: '16px',
        }}
      >
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.15rem' }}>⚖️ Proposer un échange</h2>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '14px',
          }}
        >
          {picker('Je cède', give, setGive)}
          <span style={{ fontSize: '1.2rem', color: 'var(--muted)' }}>➔</span>
          {picker('Contre', want, setWant)}

          <button
            type="button"
            disabled={loading}
            onClick={publish}
            style={{ fontWeight: 600, padding: '8px 16px', marginLeft: 'auto' }}
          >
            Publier l’offre
          </button>
        </div>
      </section>

      {message && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius, 8px)',
            background: message.error
              ? 'color-mix(in srgb, var(--warn) 15%, var(--panel))'
              : 'color-mix(in srgb, var(--ok) 15%, var(--panel))',
            color: message.error ? 'var(--warn)' : 'var(--ok)',
            border: message.error
              ? '1px solid color-mix(in srgb, var(--warn) 30%, transparent)'
              : '1px solid color-mix(in srgb, var(--ok) 30%, transparent)',
            marginBottom: '16px',
            fontWeight: 500,
          }}
          role="status"
        >
          {message.text}
        </div>
      )}

      {/* Vos offres */}
      <section className="panel" aria-label="Vos offres" style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: '0 0 10px 0', fontSize: '1.15rem' }}>📜 Vos offres en cours</h2>
        {mine.length === 0 ? (
          <p className="muted" style={{ padding: '8px 0', margin: 0 }}>
            Vous n’avez aucune offre active sur le marché pour l’instant.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '8px' }}>
            {mine.map((offer) => (
              <li
                key={offer.offerId}
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
                  <AmountsText amounts={offer.give} />{' '}
                  <span style={{ color: 'var(--muted)', margin: '0 6px' }}>contre</span>{' '}
                  <AmountsText amounts={offer.want} />
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      marginLeft: '10px',
                      background:
                        offer.status === 'open'
                          ? 'color-mix(in srgb, var(--ok) 15%, var(--panel))'
                          : 'color-mix(in srgb, var(--muted) 15%, var(--panel))',
                      color: offer.status === 'open' ? 'var(--ok)' : 'var(--muted)',
                    }}
                  >
                    {OFFER_STATUS[offer.status]}
                  </span>
                </div>

                {offer.status === 'open' && (
                  <button
                    type="button"
                    className="link"
                    disabled={loading}
                    onClick={() => withdrawOffer(offer.offerId)}
                    style={{ fontSize: '0.85rem' }}
                  >
                    Retirer l’offre
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Offres des autres joueurs */}
      <section className="panel" aria-label="Offres des autres joueurs">
        <h2 style={{ margin: '0 0 10px 0', fontSize: '1.15rem' }}>🤝 Offres disponibles</h2>
        {others.length === 0 ? (
          <p className="muted" style={{ padding: '8px 0', margin: 0 }}>
            Aucune offre publiée par d’autres joueurs pour le moment.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '8px' }}>
            {others.map((offer) => (
              <li
                key={offer.offerId}
                style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: 'color-mix(in srgb, var(--bg) 45%, var(--panel))',
                  border: '1px solid color-mix(in srgb, var(--muted) 20%, transparent)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <div>
                  <strong>{offer.sellerName}</strong>{' '}
                  <span style={{ color: 'var(--muted)' }}>propose</span>{' '}
                  <AmountsText amounts={offer.give} />{' '}
                  <span style={{ color: 'var(--muted)' }}>en échange de</span>{' '}
                  <AmountsText amounts={offer.want} />
                </div>

                <button
                  type="button"
                  disabled={loading}
                  onClick={() => acceptOffer(offer.offerId)}
                  style={{
                    fontWeight: 600,
                    padding: '8px 14px',
                    fontSize: '0.9rem',
                    background: 'var(--ok)',
                  }}
                >
                  Accepter l’échange
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
