import { api } from './api.js'

export const agentApi = {
  chat: (message, history) => api.post('/api/agent/chat', { message, history }),
  confirm: (tool, args) => api.post('/api/agent/confirm', { tool, args, confirmed: true }),
}
