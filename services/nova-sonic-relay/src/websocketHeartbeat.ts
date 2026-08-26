import { WebSocket } from 'ws'

const alive = new WeakMap<WebSocket, boolean>()

export function trackHeartbeat(ws: WebSocket): void {
  alive.set(ws, true)
  ws.on('pong', () => alive.set(ws, true))
}

export function sweepHeartbeatSockets(clients: Iterable<WebSocket>): void {
  for (const ws of clients) {
    if (ws.readyState !== WebSocket.OPEN) continue
    if (alive.get(ws) === false) {
      ws.terminate()
      continue
    }
    alive.set(ws, false)
    try {
      ws.ping()
    } catch {
      ws.terminate()
    }
  }
}
