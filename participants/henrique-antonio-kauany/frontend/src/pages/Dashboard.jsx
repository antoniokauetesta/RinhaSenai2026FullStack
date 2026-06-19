import React, { useState, useEffect, useCallback } from 'react'
import { apiFetch, formatCents } from '../api.js'

const BRAND_BY_DIGIT = {
  4: { name: 'visa', fee: 0.025 },
  5: { name: 'mastercard', fee: 0.03 },
  3: { name: 'amex', fee: 0.035 },
  6: { name: 'elo', fee: 0.04 },
}

function calcPreview(amountReais, installments) {
  const amountCents = Math.round(parseFloat(amountReais || '0') * 100)
  if (!amountCents || amountCents <= 0) return null

  let rate = 0
  if (installments >= 2 && installments <= 6) rate = 0.02
  else if (installments >= 7 && installments <= 12) rate = 0.04

  const totalWithInterest =
    rate === 0 ? amountCents : Math.ceil(amountCents * Math.pow(1 + rate, installments))
  const installmentAmount = Math.ceil(totalWithInterest / installments)

  return { amountCents, totalWithInterest, installmentAmount }
}

function detectBrand(cardNumber) {
  const digit = (cardNumber || '')[0]
  return BRAND_BY_DIGIT[digit] || null
}

function formatCardNumberInput(value) {
  const digits = value.replace(/\D/g, '').slice(0, 16)
  return digits.replace(/(.{4})/g, '$1 ').trim()
}

function formatExpirationInput(value) {
  const digits = value.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}/${digits.slice(2)}`
}

const initialForm = {
  card_number: '',
  holder_name: '',
  expiration: '',
  cvv: '',
  amount: '',
  installments: 1,
  description: '',
}

export default function Dashboard() {
  const [form, setForm] = useState(initialForm)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState(null) // { type: 'success'|'error', message }
  const [balance, setBalance] = useState(null)

  const loadBalance = useCallback(async () => {
    try {
      const data = await apiFetch('/balance')
      setBalance(data)
    } catch {
      // silencioso — saldo não é crítico para o formulário funcionar
    }
  }, [])

  useEffect(() => {
    loadBalance()
  }, [loadBalance])

  const rawCardNumber = form.card_number.replace(/\D/g, '')
  const brand = detectBrand(rawCardNumber)
  const preview = calcPreview(form.amount, Number(form.installments))
  const feeCents = preview && brand ? Math.round(preview.totalWithInterest * brand.fee) : null
  const netCents = preview && feeCents !== null ? preview.totalWithInterest - feeCents : null

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFeedback(null)
    setSubmitting(true)

    try {
      const amountCents = Math.round(parseFloat(form.amount || '0') * 100)
      const payload = {
        card_number: rawCardNumber,
        holder_name: form.holder_name.trim(),
        expiration: form.expiration,
        cvv: form.cvv,
        amount_cents: amountCents,
        installments: Number(form.installments),
        description: form.description.trim(),
        idempotency_key:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`,
      }

      const result = await apiFetch('/transactions', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      if (result.status === 'declined') {
        setFeedback({
          type: 'error',
          message: `Transação recusada · cartão final ${result.card_last4}`,
        })
      } else {
        setFeedback({
          type: 'success',
          message: `Aprovada · líquido ${formatCents(result.net_amount)}`,
        })
        setForm(initialForm)
      }
      loadBalance()
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.data?.error ? translateError(err.data.error) : 'Falha ao processar cobrança',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <p className="section-eyebrow">saldo consolidado</p>
      <div className="balance-grid">
        <div className="balance-cell is-primary">
          <span className="balance-cell-label">Saldo líquido</span>
          <span className="display-balance balance-cell-value" data-value={balance?.balance ?? 0}>
            {formatCents(balance?.balance ?? 0)}
          </span>
        </div>
        <div className="balance-cell">
          <span className="balance-cell-label">Aprovadas</span>
          <span
            className="display-total-approved balance-cell-value is-approved"
            data-value={balance?.total_approved ?? 0}
          >
            {balance?.total_approved ?? 0}
          </span>
        </div>
        <div className="balance-cell">
          <span className="balance-cell-label">Recusadas</span>
          <span
            className="display-total-declined balance-cell-value is-declined"
            data-value={balance?.total_declined ?? 0}
          >
            {balance?.total_declined ?? 0}
          </span>
        </div>
        <div className="balance-cell">
          <span className="balance-cell-label">Estornadas</span>
          <span
            className="display-total-refunded balance-cell-value is-refunded"
            data-value={balance?.total_refunded ?? 0}
          >
            {balance?.total_refunded ?? 0}
          </span>
        </div>
      </div>

      <p className="section-eyebrow">nova cobrança</p>
      <h1 className="section-title">Processar pagamento</h1>

      <form className="pay-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="card_number">Número do cartão</label>
            <input
              id="card_number"
              className="input-card-number"
              inputMode="numeric"
              placeholder="0000 0000 0000 0000"
              value={formatCardNumberInput(form.card_number)}
              onChange={(e) => update('card_number', e.target.value)}
              maxLength={19}
              required
            />
            <span className="field-hint">
              {brand ? `bandeira detectada: ${brand.name}` : '4=visa · 5=mastercard · 3=amex · 6=elo'}
            </span>
          </div>

          <div className="field span-2">
            <label htmlFor="holder_name">Nome no cartão</label>
            <input
              id="holder_name"
              className="input-holder-name"
              placeholder="Nome completo"
              value={form.holder_name}
              onChange={(e) => update('holder_name', e.target.value)}
              maxLength={50}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="expiration">Validade</label>
            <input
              id="expiration"
              className="input-expiration"
              placeholder="MM/AA"
              inputMode="numeric"
              value={form.expiration}
              onChange={(e) => update('expiration', formatExpirationInput(e.target.value))}
              maxLength={5}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="cvv">CVV</label>
            <input
              id="cvv"
              className="input-cvv"
              inputMode="numeric"
              placeholder="123"
              value={form.cvv}
              onChange={(e) => update('cvv', e.target.value.replace(/\D/g, '').slice(0, 4))}
              maxLength={4}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="amount">Valor (R$)</label>
            <input
              id="amount"
              className="input-amount"
              inputMode="decimal"
              placeholder="0,00"
              value={form.amount}
              onChange={(e) => update('amount', e.target.value.replace(',', '.'))}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="installments">Parcelas</label>
            <select
              id="installments"
              className="select-installments"
              value={form.installments}
              onChange={(e) => update('installments', e.target.value)}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}x{n === 1 ? ' à vista' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="field span-2">
            <label htmlFor="description">Descrição</label>
            <input
              id="description"
              className="input-description"
              placeholder="Ex: Assinatura mensal"
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              maxLength={100}
              required
            />
          </div>
        </div>

        {preview && (
          <div className="fee-preview">
            <div className="fee-step">
              <span className="fee-step-label">valor</span>
              <span className="fee-step-value">{formatCents(preview.amountCents)}</span>
            </div>
            <span className="fee-arrow">→</span>
            <div className="fee-step">
              <span className="fee-step-label">{form.installments}x com juros</span>
              <span className="fee-step-value">{formatCents(preview.totalWithInterest)}</span>
            </div>
            <span className="fee-arrow">→</span>
            <div className="fee-step">
              <span className="fee-step-label">
                taxa {brand ? `(${(brand.fee * 100).toFixed(1)}%)` : ''}
              </span>
              <span className="fee-step-value">{feeCents !== null ? `−${formatCents(feeCents)}` : '—'}</span>
            </div>
            <span className="fee-arrow">→</span>
            <div className="fee-step">
              <span className="fee-step-label">líquido</span>
              <span className="fee-step-value is-net">
                {netCents !== null ? formatCents(netCents) : '—'}
              </span>
            </div>
          </div>
        )}

        <button className="btn-pay" type="submit" disabled={submitting}>
          {submitting ? 'Processando…' : 'Cobrar'}
        </button>

        {feedback?.type === 'success' && (
          <div className="feedback-success">✓ {feedback.message}</div>
        )}
        {feedback?.type === 'error' && <div className="feedback-error">✕ {feedback.message}</div>}
      </form>
    </>
  )
}

function translateError(code) {
  const map = {
    invalid_amount_cents: 'Valor inválido (máx. R$ 10.000,00)',
    invalid_card_number: 'Número do cartão precisa ter 16 dígitos',
    invalid_cvv: 'CVV inválido',
    invalid_holder_name: 'Nome do titular inválido',
    invalid_expiration: 'Validade inválida ou cartão vencido',
    invalid_installments: 'Número de parcelas inválido (1–12)',
    invalid_description: 'Descrição obrigatória (máx. 100 caracteres)',
    invalid_card_brand: 'Bandeira não suportada',
    installment_below_minimum: 'Valor da parcela abaixo do mínimo (R$ 10,00)',
  }
  return map[code] || code
}
