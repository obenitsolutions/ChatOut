/*
 * HTTP logger middleware — one line per request so the backend is no
 * longer silent. Logs method + path at request entry (info), then logs
 * status + duration on res.finish. Severity scales with status class:
 * 2xx/3xx → info, 4xx → warn, 5xx → error. Includes req.ip.
 *
 * Lightweight by design: no external deps, reuses the winston logger.
 */

import { logger } from '../logging/logger.js'

export function httpLogger(req, res, next) {
  const start = process.hrtime.bigint()
  const { method } = req
  const path = req.originalUrl || req.url
  const ip = req.ip

  logger.info(`[http] ${method} ${path}`, { method, path, ip })

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6
    const status = res.statusCode
    const meta = {
      method,
      path,
      ip,
      status,
      durationMs: Math.round(durationMs * 100) / 100,
    }
    const msg = `[http] ${method} ${path} ${status} ${meta.durationMs}ms`

    if (status >= 500) logger.error(msg, meta)
    else if (status >= 400) logger.warn(msg, meta)
    else logger.info(msg, meta)
  })

  next()
}
