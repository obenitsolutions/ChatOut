/*
 * ChatOut Backend — entry point
 * Express 5 server for the ChatOut conversational checkout.
 * Handles: chat proxying, anonymization, basic shop data.
 */

import { createApp } from './src/app.js'
import { PORT } from './src/config/paths.js'
import { logger } from './src/logging/logger.js'

const app = createApp()

app.listen(PORT, () => {
  logger.info(`ChatOut backend listening on http://localhost:${PORT}`)
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`)
})
