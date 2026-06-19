import React, { useState } from 'react'

// Credenciais de exemplo — troque por autenticação real se quiser
const VALID_USER = 'admin'
const VALID_PASS = 'ahk2026'

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // Simula um pequeno delay de "autenticação"
    await new Promise((r) => setTimeout(r, 600))

    if (username.trim() === VALID_USER && password === VALID_PASS) {
      onLogin()
    } else {
      setError('Usuário ou senha inválidos')
    }
    setLoading(false)
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="brand login-brand">
          <span className="brand-mark">$</span>
          <span className="brand-name">AHK Pagamentos</span>
        </div>

        <p className="login-subtitle">Acesse sua conta para continuar</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="login-user">Usuário</label>
            <input
              id="login-user"
              type="text"
              placeholder="seu usuário"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="login-pass">Senha</label>
            <input
              id="login-pass"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <div className="feedback-error">✕ {error}</div>}

          <button className="btn-pay" type="submit" disabled={loading}>
            {loading ? 'Verificando…' : 'Entrar'}
          </button>
        </form>

        <p className="login-hint">
          Demo: usuário <code>admin</code> · senha <code>ahk2026</code>
        </p>
      </div>
    </div>
  )
}
