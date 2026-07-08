/**
 * Simple sliding-window rate limiter, in-memory.
 *
 * Default: 30 requests / 60 seconds, per (sessionId + IP) tuple.
 * Returns 429 with Retry-After when exceeded.
 *
 * This is intentionally lightweight — the hackathon runs single-node.
 * Swap for Redis when scaling out.
 */

const buckets = new Map()

/**
 * Make a rate limiter middleware.
 * @param {Object} opts
 * @param {number} opts.windowMs     - window length in ms
 * @param {number} opts.max          - max requests per window
 * @param {string} opts.keyHeader    - header to take the sessionId from
 */
export function rateLimit({ windowMs = 60_000, max = 30, keyHeader = 'x-session-id' } = {}) {
  /* Sweep stale buckets periodically (every 5 minutes) so memory
     doesn't grow unbounded under random IP traffic. */
  setInterval(() => {
    const now = Date.now()
    for (const [k, b] of buckets) {
      if (b.resetAt < now - windowMs) buckets.delete(k)
    }
  }, 5 * 60_000).unref?.()

  return function rateLimitMw(req, res, next) {
    const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim()
      || req.socket?.remoteAddress
      || 'unknown'
    const sessionId = (req.headers[keyHeader] || req.body?.sessionId || 'anon').toString().slice(0, 64)
    const key = `${ip}|${sessionId}`

    const now = Date.now()
    let b = buckets.get(key)
    if (!b || b.resetAt < now) {
      b = { count: 0, resetAt: now + windowMs }
      buckets.set(key, b)
    }

    b.count += 1
    const remaining = Math.max(0, max - b.count)
    res.setHeader('X-RateLimit-Limit', String(max))
    res.setHeader('X-RateLimit-Remaining', String(remaining))
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(b.resetAt / 1000)))

    if (b.count > max) {
      const retryAfter = Math.ceil((b.resetAt - now) / 1000)
      res.setHeader('Retry-After', String(retryAfter))
      return res.status(429).json({
        ok: false,
        error: 'Too many requests',
        message: `You're sending messages too quickly. Try again in ${retryAfter}s.`,
        retryAfter,
      })
    }
    next()
  }
}