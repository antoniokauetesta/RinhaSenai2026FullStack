// Regras de negócio do gateway de pagamentos.
// Mantidas puras (sem I/O) para facilitar testes e raciocínio.

export const BRANDS = {
  4: { name: 'visa', fee: 0.025 },
  5: { name: 'mastercard', fee: 0.03 },
  3: { name: 'amex', fee: 0.035 },
  6: { name: 'elo', fee: 0.04 },
}

export const DAILY_LIMIT_CENTS = 500_000
export const MIN_INSTALLMENT_CENTS = 1000
export const MAX_AMOUNT_CENTS = 1_000_000

export function getBrandFromCardNumber(cardNumber) {
  const firstDigit = cardNumber[0]
  return BRANDS[firstDigit] || null
}

/**
 * Calcula juros compostos por parcela.
 * 1x: 0% | 2-6x: 2%/mês | 7-12x: 4%/mês
 * total_with_interest = ceil(amount * (1+rate)^n)
 */
export function calculateInterest(amountCents, installments) {
  let rate = 0
  if (installments >= 2 && installments <= 6) rate = 0.02
  else if (installments >= 7 && installments <= 12) rate = 0.04

  const totalWithInterest =
    rate === 0
      ? amountCents
      : Math.ceil(amountCents * Math.pow(1 + rate, installments))

  const installmentAmount = Math.ceil(totalWithInterest / installments)

  return { totalWithInterest, installmentAmount }
}

/**
 * Taxa da bandeira incide sobre o total COM juros (total_with_interest),
 * não sobre o amount_cents original. Essa é a pegadinha clássica.
 */
export function calculateFee(totalWithInterest, brandFeeRate) {
  const feeCents = Math.round(totalWithInterest * brandFeeRate)
  const netAmount = totalWithInterest - feeCents
  return { feeCents, netAmount }
}

export function isCardBlocked(cardNumber) {
  return cardNumber.startsWith('9999')
}

export function last4(cardNumber) {
  return cardNumber.slice(-4)
}

// ---- Validações de entrada ----

export function isValidCardNumber(v) {
  return typeof v === 'string' && /^\d{16}$/.test(v)
}

export function isValidCvv(v) {
  return typeof v === 'string' && /^\d{3,4}$/.test(v)
}

export function isValidHolderName(v) {
  if (typeof v !== 'string') return false
  const trimmed = v.trim()
  if (trimmed.length === 0 || trimmed.length > 50) return false
  if (/<[^>]*>/.test(trimmed)) return false // sem tags HTML
  return true
}

export function isValidExpiration(v) {
  if (typeof v !== 'string' || !/^\d{2}\/\d{2}$/.test(v)) return false
  const [mm, yy] = v.split('/').map(Number)
  if (mm < 1 || mm > 12) return false

  const fullYear = 2000 + yy
  // válido até o fim do mês informado
  const expiryEnd = new Date(fullYear, mm, 0, 23, 59, 59, 999)
  const now = new Date()
  return expiryEnd.getTime() >= now.getTime()
}

export function isValidAmount(v) {
  return Number.isInteger(v) && v > 0 && v <= MAX_AMOUNT_CENTS
}

export function isValidInstallments(v) {
  return Number.isInteger(v) && v >= 1 && v <= 12
}

export function isValidDescription(v) {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= 100
}

/**
 * Valida o payload completo de criação de transação.
 * Retorna { valid: true } ou { valid: false, error: string }.
 * Não valida bandeira nem valor mínimo de parcela (tratados à parte,
 * pois dependem de cálculos derivados).
 */
export function validateTransactionInput(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'invalid_body' }
  }

  const {
    amount_cents,
    card_number,
    cvv,
    holder_name,
    expiration,
    installments = 1,
    description,
  } = body

  if (!isValidAmount(amount_cents)) {
    return { valid: false, error: 'invalid_amount_cents' }
  }
  if (!isValidCardNumber(card_number)) {
    return { valid: false, error: 'invalid_card_number' }
  }
  if (!isValidCvv(cvv)) {
    return { valid: false, error: 'invalid_cvv' }
  }
  if (!isValidHolderName(holder_name)) {
    return { valid: false, error: 'invalid_holder_name' }
  }
  if (!isValidExpiration(expiration)) {
    return { valid: false, error: 'invalid_expiration' }
  }
  if (!isValidInstallments(installments)) {
    return { valid: false, error: 'invalid_installments' }
  }
  if (!isValidDescription(description)) {
    return { valid: false, error: 'invalid_description' }
  }

  return { valid: true }
}
