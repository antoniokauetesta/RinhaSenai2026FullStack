import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch, formatCents, formatDate, BRAND_LABELS, STATUS_LABELS } from '../api.js'

export default function History() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const page = parseInt(searchParams.get('page') || '1', 10) || 1
  const limit = parseInt(searchParams.get('limit') || '10', 10) || 10

  const [items, setItems] = useState([])
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, total_pages: 1 })
  const [loading, setLoading] = useState(true)
  const [refundingId, setRefundingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch(`/transactions?page=${page}&limit=${limit}`)
      setItems(data.data)
      setPagination(data.pagination)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [page, limit])

  useEffect(() => {
    load()
  }, [load])

  function goToPage(p) {
    setSearchParams({ page: String(p), limit: String(limit) })
  }

  async function handleRefund(e, id) {
    e.preventDefault()
    e.stopPropagation()
    setRefundingId(id)
    try {
      await apiFetch(`/transactions/${id}/refund`, { method: 'POST' })
      load()
    } catch {
      // mantém a lista como está; usuário pode tentar de novo
    } finally {
      setRefundingId(null)
    }
  }

  return (
    <>
      <p className="section-eyebrow">extrato completo</p>
      <h1 className="section-title">Histórico de transações</h1>

      {loading ? (
        <div className="loading-state">carregando…</div>
      ) : items.length === 0 ? (
        <div className="list-transactions">
          <div className="empty-state">Nenhuma transação ainda. Faça a primeira cobrança.</div>
        </div>
      ) : (
        <div className="list-transactions">
          {items.map((t) => (
            <div
              key={t.id}
              className="transaction-item"
              role="link"
              tabIndex={0}
              onClick={() => navigate(`/transaction/${t.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') navigate(`/transaction/${t.id}`)
              }}
            >
              <span className="transaction-id" data-value={t.id} style={{ display: 'none' }}>
                {t.id}
              </span>

              <div className="t-col">
                <span className="transaction-description" data-value={t.description}>
                  {t.description}
                </span>
                <span className="transaction-card" data-value={t.card_last4}>
                  <span className="transaction-meta">
                    {BRAND_LABELS[t.card_brand] || t.card_brand} •••• {t.card_last4}
                  </span>
                </span>
                <span className="transaction-date" data-value={t.created_at} style={{ display: 'none' }}>
                  {t.created_at}
                </span>
              </div>

              <div className="t-col">
                <span className="transaction-amount" data-value={t.amount_cents}>
                  {formatCents(t.amount_cents)}
                </span>
                <span className="transaction-meta">
                  <span className="transaction-installments" data-value={t.installments}>
                    {t.installments}x
                  </span>{' '}
                  de{' '}
                  <span className="transaction-installment-amount" data-value={t.installment_amount}>
                    {formatCents(t.installment_amount)}
                  </span>
                </span>
                <span className="transaction-total" data-value={t.total_with_interest} style={{ display: 'none' }}>
                  {t.total_with_interest}
                </span>
                <span className="transaction-fee" data-value={t.fee_cents} style={{ display: 'none' }}>
                  {t.fee_cents}
                </span>
              </div>

              <div className="t-col">
                <span className={`status-pill transaction-status ${t.status}`} data-value={t.status}>
                  {STATUS_LABELS[t.status] || t.status}
                </span>
                <span className="transaction-meta">{formatDate(t.created_at)}</span>
              </div>

              <div className="t-actions">
                {t.status === 'approved' && (
                  <button
                    className="btn-refund"
                    onClick={(e) => handleRefund(e, t.id)}
                    disabled={refundingId === t.id}
                  >
                    {refundingId === t.id ? 'estornando…' : 'estornar'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="pagination-bar">
        <span>
          página <span className="pagination-current" data-value={pagination.page}>{pagination.page}</span> de{' '}
          <span className="pagination-pages" data-value={pagination.total_pages}>{pagination.total_pages}</span>
          {' · '}
          <span className="pagination-total" data-value={pagination.total}>{pagination.total}</span> transações
        </span>
        <div className="pagination-controls">
          <button
            className="btn-prev-page"
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
          >
            ← anterior
          </button>
          <button
            className="btn-next-page"
            onClick={() => goToPage(page + 1)}
            disabled={page >= pagination.total_pages}
          >
            próxima →
          </button>
        </div>
      </div>
    </>
  )
}
