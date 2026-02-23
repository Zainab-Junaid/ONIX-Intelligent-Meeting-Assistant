/**
 * Backend (meeting bot) base URL. Used by dashboard API routes to proxy to the bot service.
 * Set BACKEND_URL in .env.local when the backend runs elsewhere (e.g. Docker host, production).
 */
export const getBackendUrl = (): string =>
  process.env.BACKEND_URL || process.env.BOT_BACKEND_URL || 'http://127.0.0.1:3001';
