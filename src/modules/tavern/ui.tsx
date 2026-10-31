'use client'

import { hc } from 'hono/client'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import type { TavernApi } from './api'
import {
  HEARTBEAT_MS,
  MESSAGE_MAX_LENGTH,
  type MessageError,
  type PresentPlayer,
  TAVERN_CHANNEL,
  type TavernMessage,
} from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<TavernApi>('/api/tavern')

/** Libellé affiché pour chaque état de la connexion temps réel. */
const STATUS_LABELS = {
  connecting: 'Connexion...',
  open: 'Temps réel connecté',
  reconnecting: 'Reconnexion...',
} as const

function errorText(error: MessageError | { code: 'INVALID_INPUT' }): string {
  switch (error.code) {
    case 'EMPTY_MESSAGE':
      return 'Le message est vide.'
    case 'MESSAGE_TOO_LONG':
      return `Le message dépasse ${error.max} caractères.`
    case 'TOO_MANY_MESSAGES':
      return `Trop de messages : patientez ${Math.ceil(error.retryAfterMs / 1000)} secondes.`
    case 'INVALID_INPUT':
      return 'Saisie invalide.'
  }
}

function merge(current: TavernMessage[], added: TavernMessage[]): TavernMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]))
  for (const message of added) byId.set(message.id, message)
  return [...byId.values()].sort((a, b) => a.id - b.id)
}

let leaving: Promise<unknown> = Promise.resolve()

function leave() {
  leaving = fetch('/api/tavern/presence/leave', { method: 'POST', keepalive: true }).catch(() => {})
}

const timeOf = (at: number) =>
  new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

/** Écran de la Taverne : salon de discussion et joueurs présents. */
export function TavernScreen({ userId }: { userId: string }) {
  const [messages, setMessages] = useState<TavernMessage[]>([])
  const [players, setPlayers] = useState<PresentPlayer[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    const res = await client.messages.$get()
    if (!res.ok) return
    const latest = (await res.json()).messages
    setMessages((current) => merge(current, latest))
  }, [])

  const status = useChannel(TAVERN_CHANNEL, (event) => {
    setMessages((current) => merge(current, [event.data as unknown as TavernMessage]))
  })

  useEffect(() => {
    if (status === 'open') refresh()
  }, [status, refresh])

  useEffect(() => {
    const beat = async () => {
      await leaving
      const res = await client.presence.$post()
      if (res.ok) setPlayers((await res.json()).players)
    }
    beat()
    const timer = setInterval(beat, HEARTBEAT_MS)
    window.addEventListener('pagehide', leave)
    return () => {
      clearInterval(timer)
      window.removeEventListener('pagehide', leave)
      leave()
    }
  }, [])

  async function send(event: FormEvent) {
    event.preventDefault()
    if (!draft.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await client.messages.$post({ json: { body: draft } })
      const body = await res.json()
      if ('error' in body) {
        setError(errorText(body.error as MessageError))
      } else {
        setDraft('')
        setMessages((current) => merge(current, [body.message]))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <main>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <h1 style={{ margin: 0 }}>
            <Entity kind="tavern" /> La Taverne du Repos
          </h1>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.95rem' }}>
            Partagez vos récits d’aventures et discutez en direct avec les autres joueurs
          </p>
        </div>
        <span className="status" data-status={status}>
          {STATUS_LABELS[status]}
        </span>
      </div>

      <div
        className="tavern"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 220px',
          gap: '16px',
          alignItems: 'start',
        }}
      >
        {/* Salon des messages */}
        <section
          className="panel"
          aria-label="Messages"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
          }}
        >
          <div
            style={{
              maxHeight: '60vh',
              minHeight: '260px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              paddingRight: '6px',
            }}
          >
            {messages.length === 0 && (
              <p className="muted" style={{ textAlign: 'center', margin: 'auto 0' }}>
                Aucun message dans la taverne. Soyez le premier à engager la conversation !
              </p>
            )}

            {messages.map((message) => {
              const isMine = message.authorId === userId
              return (
                <div
                  key={message.id}
                  style={{
                    alignSelf: isMine ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    background: isMine
                      ? 'color-mix(in srgb, var(--accent) 18%, var(--panel))'
                      : 'color-mix(in srgb, var(--bg) 50%, var(--panel))',
                    border: isMine
                      ? '1px solid color-mix(in srgb, var(--accent) 35%, transparent)'
                      : '1px solid color-mix(in srgb, var(--muted) 20%, transparent)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '0.8rem',
                      color: isMine ? 'var(--accent)' : 'var(--muted)',
                      marginBottom: '2px',
                    }}
                  >
                    <strong>{message.authorName}</strong>
                    <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                      {timeOf(message.postedAt)}
                    </span>
                  </div>
                  <div
                    style={{ color: 'var(--ink)', fontSize: '0.95rem', wordBreak: 'break-word' }}
                  >
                    {message.body}
                  </div>
                </div>
              )
            })}
          </div>

          <form onSubmit={send} style={{ display: 'flex', gap: '8px', maxWidth: '100%' }}>
            <input
              aria-label="Votre message"
              value={draft}
              maxLength={MESSAGE_MAX_LENGTH * 2}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Écrivez un message à la taverne..."
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid color-mix(in srgb, var(--muted) 40%, transparent)',
                background: 'var(--panel)',
                color: 'var(--ink)',
                font: 'inherit',
              }}
            />
            <button
              type="submit"
              disabled={loading || !draft.trim()}
              style={{ fontWeight: 600, padding: '8px 16px' }}
            >
              Envoyer
            </button>
          </form>

          {error && (
            <p className="error" role="alert" style={{ margin: 0, fontSize: '0.85rem' }}>
              {error}
            </p>
          )}
        </section>

        {/* Joueurs présents */}
        <section
          className="panel"
          aria-label="Joueurs présents"
          style={{
            border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
          }}
        >
          <h2 style={{ margin: '0 0 10px 0', fontSize: '1.1rem' }}>
            🍺 Présents ({players.length})
          </h2>
          {players.length === 0 ? (
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              Aucun joueur détecté.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '6px' }}>
              {players.map((player) => (
                <li
                  key={player.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.9rem',
                    color: 'var(--ink)',
                  }}
                >
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: 'var(--ok)',
                      display: 'inline-block',
                    }}
                  />
                  <span>{player.name}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}
