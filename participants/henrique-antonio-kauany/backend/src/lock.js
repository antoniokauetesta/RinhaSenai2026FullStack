const lockMap = new Map()

/**
 * Executa `fn` garantindo exclusão mútua por `key`.
 * Requests concorrentes na mesma key são enfileiradas e processadas
 * sequencialmente, uma de cada vez.
 */
export async function withLock(key, fn) {
  const current = lockMap.get(key) || Promise.resolve()
  let resolveLock
  const next = new Promise((r) => {
    resolveLock = r
  })
  lockMap.set(key, current.then(() => next))

  try {
    await current
    return await fn()
  } finally {
    resolveLock()
    if (lockMap.get(key) === next) {
      lockMap.delete(key)
    }
  }
}
