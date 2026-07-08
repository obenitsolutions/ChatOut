/*
 * SQLite database client — singleton connection, promise-based wrapper.
 * ChatOut uses SQLite for session tracking and anonymization mappings.
 */

import sqlite3 from 'sqlite3'
import { DB_PATH, DATA_DIR } from '../config/paths.js'
import { existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { logger } from '../logging/logger.js'

/* Ensure data directory exists */
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true })
}

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    logger.error('Failed to connect to SQLite:', err.message)
    process.exit(1)
  }
  logger.info(`SQLite connected: ${DB_PATH}`)
})

/* Enable WAL mode for better concurrent reads */
db.run('PRAGMA journal_mode = WAL')
db.run('PRAGMA foreign_keys = ON')

/**
 * Run a SQL statement (INSERT, UPDATE, DELETE).
 * @returns {Promise<{ lastID: number, changes: number }>}
 */
export function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err)
      resolve({ lastID: this.lastID, changes: this.changes })
    })
  })
}

/**
 * Get a single row.
 * @returns {Promise<Object|null>}
 */
export function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err)
      resolve(row || null)
    })
  })
}

/**
 * Get all matching rows.
 * @returns {Promise<Array<Object>>}
 */
export function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err)
      resolve(rows || [])
    })
  })
}

/**
 * Close the database connection (for graceful shutdown).
 */
export function closeDatabase() {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) return reject(err)
      resolve()
    })
  })
}
