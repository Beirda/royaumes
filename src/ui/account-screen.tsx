'use client'

import { useState } from 'react'

/** Phrase que le joueur doit saisir pour confirmer la suppression de son compte. */
const CONFIRMATION = 'SUPPRIMER'

/**
 * Écran « Mes données » : export des données personnelles, et suppression du compte.
 * Il n'appartient à aucun module : les droits du joueur portent sur le jeu entier.
 */
export function AccountScreen() {
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const exportUrl = '/api/account/export'

  async function erase() {
    setBusy(true)
    const res = await fetch('/api/account', { method: 'DELETE' })
    if (res.ok) {
      window.location.href = '/login'
    } else {
      setBusy(false)
      setError('La suppression n’a pas abouti. Vous pouvez la relancer.')
    }
  }

  return (
    <main>
      <div style={{ marginBottom: '16px' }}>
        <h1 style={{ margin: 0 }}>🛡️ Confidentialité & Données personnelles</h1>
        <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.95rem' }}>
          Gérez vos données personnelles conformément au RGPD (droit d’accès, portabilité et oubli)
        </p>
      </div>

      <section
        className="panel"
        aria-label="Exporter mes données"
        style={{
          border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
          marginBottom: '16px',
        }}
      >
        <h2 style={{ margin: '0 0 8px 0', fontSize: '1.15rem' }}>📦 Exporter mes données</h2>
        <p className="muted" style={{ margin: '0 0 16px 0', fontSize: '0.9rem' }}>
          Téléchargez, au format JSON, l’ensemble des données que le jeu conserve à votre sujet :
          compte, village, équipements de forge, expéditions, offres du marché, messages et
          classement.
        </p>
        <a
          className="button"
          href={exportUrl}
          download
          style={{ fontWeight: 600, padding: '10px 18px' }}
        >
          Télécharger l’archive JSON
        </a>
      </section>

      <section
        className="panel"
        aria-label="Supprimer mon compte"
        style={{
          border: '1px solid color-mix(in srgb, var(--warn) 30%, transparent)',
          background: 'color-mix(in srgb, var(--warn) 4%, var(--panel))',
        }}
      >
        <h2 style={{ margin: '0 0 8px 0', fontSize: '1.15rem', color: 'var(--warn)' }}>
          ⚠️ Supprimer définitivement mon compte
        </h2>
        <p className="muted" style={{ margin: '0 0 16px 0', fontSize: '0.9rem' }}>
          Votre compte, vos messages et votre présence dans la Taverne sont supprimés. Votre nom et
          celui de votre village sont anonymisés partout ailleurs. Cette opération est irréversible.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
          <label htmlFor="confirmation" style={{ fontSize: '0.9rem', fontWeight: 600 }}>
            Saisissez <code style={{ color: 'var(--warn)' }}>{CONFIRMATION}</code> pour confirmer :
          </label>
          <input
            id="confirmation"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="off"
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid color-mix(in srgb, var(--warn) 40%, transparent)',
            }}
          />
          <button
            type="button"
            disabled={busy || confirmation !== CONFIRMATION}
            onClick={erase}
            style={{
              background: 'var(--warn)',
              color: 'white',
              fontWeight: 600,
              padding: '8px 16px',
            }}
          >
            {busy ? 'Suppression en cours...' : 'Supprimer mon compte'}
          </button>
        </div>
        {error && (
          <p className="error" role="status" style={{ margin: '10px 0 0 0' }}>
            {error}
          </p>
        )}
      </section>
    </main>
  )
}
