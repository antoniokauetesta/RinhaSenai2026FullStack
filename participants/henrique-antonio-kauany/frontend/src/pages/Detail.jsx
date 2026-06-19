import React, { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { apiFetch, formatCents, formatDate, BRAND_LABELS, STATUS_LABELS } from '../api.js'

export default function Detail() {
  const { id } = useParams()
  const [transaction, setTransaction] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [refunding, setRefunding] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setNotFound(false)
    try {
      const data = await apiFetch(`/transactions/${id}`)
      setTransaction(data)
    } catch (err) {
      if (err.status === 404) setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  async function handleRefund() {
    setRefunding(true)
    setError(null)
    try {
      const data = await apiFetch(`/transactions/${id}/refund`, { method: 'POST' })
      setTransaction(data)
    } catch {
      setError('Não foi possível estornar esta transação.')
    } finally {
      setRefunding(false)
    }
  }

  if (loading) {
    return <div className="loading-state">carregando…</div>
  }

  if (notFound || !transaction) {
    return (
      <>
        <Link className="back-link" to="/history">
          ← voltar ao histórico
        </Link>
        <div className="empty-state">Transação não encontrada.</div>
      </>
    )
  }

  const t = transaction

  return (
    <>
      <Link className="back-link" to="/history">
        ← voltar ao histórico
      </Link>

      <div className="detail-panel">
        <div className="detail-header">
          <div>
            <p className="section-eyebrow">transação</p>
            <span className="detail-amount-big detail-amount" data-value={t.amount_cents}>
              {formatCents(t.amount_cents)}
            </span>
          </div>
          <span className={`status-pill detail-status ${t.status}`} data-value={t.status}>
            {STATUS_LABELS[t.status] || t.status}
          </span>
        </div>

        <div className="detail-grid">
          <div className="detail-grid-cell">
            <span className="detail-grid-label">ID</span>
            <span className="detail-grid-value detail-id" data-value={t.id} style={{ fontSize: 12 }}>
              {t.id}
            </span>
          </div>
          <div className="detail-grid-cell">
            <span className="detail-grid-label">Titular</span>
            <span className="detail-grid-value detail-holder" data-value={t.holder_name}>
              {t.holder_name}
            </span>
          </div>
          <div className="detail-grid-cell">
            <span className="detail-grid-label">Cartão</span>
            <span className="detail-grid-value detail-card" data-value={t.card_last4}>
              {BRAND_LABELS[t.card_brand] || t.card_brand}{' '}
              <span className="detail-brand" data-value={t.card_brand} style={{ display: 'none' }}>
                {t.card_brand}
              </span>
              •••• {t.card_last4}
            </span>
          </div>

          <div className="detail-grid-cell">
            <span className="detail-grid-label">Parcelamento</span>
            <span className="detail-grid-value detail-installments" data-value={t.installments}>
              {t.installments}x de{' '}
              <span
                className="detail-installment-amount"
                data-value={t.installment_amount}
              >
                {formatCents(t.installment_amount)}
              </span>
            </span>
          </div>
          <div className="detail-grid-cell">
            <span className="detail-grid-label">Total com juros</span>
            <span className="detail-grid-value detail-total" data-value={t.total_with_interest}>
              {formatCents(t.total_with_interest)}
            </span>
          </div>
          <div className="detail-grid-cell">
            <span className="detail-grid-label">Taxa da bandeira</span>
            <span className="detail-grid-value detail-fee" data-value={t.fee_cents}>
              −{formatCents(t.fee_cents)}
            </span>
          </div>

          <div className="detail-grid-cell">
            <span className="detail-grid-label">Líquido</span>
            <span
              className="detail-grid-value detail-net"
              data-value={t.net_amount}
              style={{ color: 'var(--ok)' }}
            >
              {formatCents(t.net_amount)}
            </span>
          </div>
          <div className="detail-grid-cell">
            <span className="detail-grid-label">Descrição</span>
            <span className="detail-grid-value detail-description" data-value={t.description}>
              {t.description}
            </span>
          </div>
          <div className="detail-grid-cell">
            <span className="detail-grid-label">Data</span>
            <span className="detail-grid-value detail-date" data-value={t.created_at}>
              {formatDate(t.created_at)}
            </span>
          </div>
        </div>

        {t.status === 'approved' && (
          <div style={{ marginTop: 24 }}>
            <button className="btn-refund" onClick={handleRefund} disabled={refunding}>
              {refunding ? 'estornando…' : 'estornar transação'}
            </button>
          </div>
        )}

        {error && (
          <div className="feedback-error" style={{ marginTop: 16 }}>
            ✕ {error}
          </div>
        )}
      </div>
    </>
  )
}
