/*
 * Winston logger — structured JSON logs in production, pretty in dev.
 */

import winston from 'winston'
import { LOGS_DIR, NODE_ENV } from '../config/paths.js'

const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : ''
    return `${timestamp} ${level}: ${message}${metaStr}`
  })
)

const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
)

export const logger = winston.createLogger({
  level: NODE_ENV === 'production' ? 'info' : 'debug',
  format: NODE_ENV === 'production' ? prodFormat : devFormat,
  transports: [
    new winston.transports.Console(),
    ...(NODE_ENV === 'production'
      ? [
          new winston.transports.File({
            filename: `${LOGS_DIR}/error.log`,
            level: 'error',
          }),
          new winston.transports.File({ filename: `${LOGS_DIR}/combined.log` }),
        ]
      : []),
  ],
})
