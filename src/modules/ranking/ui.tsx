'use client'

import { hc } from 'hono/client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { type ChannelEvent, useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import type { RankingApi } from './api'
import { RANKING_CHANNEL, type Ranking } from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<RankingApi>('/api/ranking')

/** Libellé affiché pour chaque état de la connexion temps réel. */
const STATUS_LABELS = {
  connecting: 'Connexion...',
  open: 'Temps réel connecté',
  reconnecting: 'Reconnexion...',
} as const

const RETRY_MS = 1_000
const MAX_READS = 10

function rankBadge(rank: number) {
  if (rank === 1) return '🥇 1'
  if (rank === 2) return '🥈 2'
  if (rank === 3) return '🥉 3'
  return `#${rank}`
}

/** Écran du Classement : les meilleurs joueurs, le joueur connecté étant mis en évidence. */
export function RankingScreen({ userId }: { userId: string }) {
  const [ranking, setRanking] = useState<Ranking | undefined>(undefined)

  const refresh = useCallback(async () => {
    const res = await client.players.$get()
    if (!res.ok) return 0
    const body = await res.json()
    setRanking(body)
    return body.position
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const wanted = useRef(0)
  const following = useRef(false)

  const follow = useCallback(
    async (event: ChannelEvent) => {
      wanted.current = Math.max(wanted.current, event.position)
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

  const status = useChannel(RANKING_CHANNEL, follow)
  const entries = ranking?.entries

  return (
    <main>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <h1 style={{ margin: 0 }}>
            <Entity kind="ranking" /> Panthéon des Seigneurs
          </h1>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.95rem' }}>
            Classement d’honneur basé sur les victoires, les richesses et la renommée des royaumes
          </p>
        </div>
        <span className="status" data-status={status}>
          {STATUS_LABELS[status]}
        </span>
      </div>

      <section
        className="panel"
        aria-label="Classement des joueurs"
        style={{
          padding: '16px',
          overflowX: 'auto',
          border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
        }}
      >
        {entries === undefined && <p className="muted">Chargement du classement...</p>}
        {entries?.length === 0 && (
          <p className="muted" style={{ padding: '16px 0', textAlign: 'center' }}>
            Aucun seigneur classé pour le moment. Partez en donjon pour inscrire votre nom dans
            l’histoire !
          </p>
        )}

        {entries && entries.length > 0 && (
          <table
            className="ranking"
            style={{
              width: '100%',
              borderCollapse: 'separate',
              borderSpacing: '0 4px',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <thead>
              <tr style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Rang</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Seigneur</th>
                <th style={{ padding: '8px 12px', textAlign: 'center' }}>Victoires</th>
                <th style={{ padding: '8px 12px', textAlign: 'center' }}>Expéditions</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>
                  <Entity kind="gold" showLabel />
                </th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Record butin</th>
                <th style={{ padding: '8px 12px', textAlign: 'center' }}>Bâtiments</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const isMe = entry.playerId === userId
                return (
                  <tr
                    key={entry.playerId}
                    style={{
                      background: isMe
                        ? 'color-mix(in srgb, var(--accent) 18%, var(--panel))'
                        : entry.rank <= 3
                          ? 'color-mix(in srgb, var(--bg) 60%, var(--panel))'
                          : 'color-mix(in srgb, var(--bg) 35%, var(--panel))',
                      fontWeight: isMe ? 700 : 500,
                      outline: isMe
                        ? '1px solid color-mix(in srgb, var(--accent) 45%, transparent)'
                        : undefined,
                      borderRadius: '6px',
                    }}
                  >
                    <td
                      style={{
                        padding: '10px 12px',
                        borderTopLeftRadius: '6px',
                        borderBottomLeftRadius: '6px',
                        fontWeight: 700,
                      }}
                    >
                      {rankBadge(entry.rank)}
                    </td>
                    <td
                      style={{ padding: '10px 12px', color: isMe ? 'var(--accent)' : 'var(--ink)' }}
                    >
                      {entry.label} {isMe && <span style={{ fontSize: '0.8rem' }}>(Vous)</span>}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--ok)' }}>
                      🏆 {entry.gamesWon}
                    </td>
                    <td
                      style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--muted)' }}
                    >
                      {entry.gamesPlayed}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
                      {entry.gold}
                    </td>
                    <td
                      style={{
                        padding: '10px 12px',
                        textAlign: 'right',
                        color: entry.bestLoot > 0 ? 'var(--accent)' : 'var(--muted)',
                      }}
                    >
                      {entry.bestLoot}
                    </td>
                    <td
                      style={{
                        padding: '10px 12px',
                        textAlign: 'center',
                        borderTopRightRadius: '6px',
                        borderBottomRightRadius: '6px',
                        color: 'var(--muted)',
                      }}
                    >
                      🏛️ {entry.upgrades}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  )
}
