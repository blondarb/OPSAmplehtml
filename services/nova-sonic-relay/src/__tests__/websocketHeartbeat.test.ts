import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { sweepHeartbeatSockets, trackHeartbeat } from '../websocketHeartbeat.js'

function fakeSocket() {
  const socket = new EventEmitter() as EventEmitter & {
    readyState: number
    ping: ReturnType<typeof vi.fn>
    terminate: ReturnType<typeof vi.fn>
  }
  socket.readyState = WebSocket.OPEN
  socket.ping = vi.fn()
  socket.terminate = vi.fn()
  return socket
}

describe('relay WebSocket heartbeat', () => {
  it('pings an active browser and terminates it only after a missed pong', () => {
    const socket = fakeSocket()
    trackHeartbeat(socket as unknown as WebSocket)

    sweepHeartbeatSockets([socket as unknown as WebSocket])
    expect(socket.ping).toHaveBeenCalledTimes(1)
    expect(socket.terminate).not.toHaveBeenCalled()

    socket.emit('pong')
    sweepHeartbeatSockets([socket as unknown as WebSocket])
    expect(socket.ping).toHaveBeenCalledTimes(2)
    expect(socket.terminate).not.toHaveBeenCalled()

    sweepHeartbeatSockets([socket as unknown as WebSocket])
    expect(socket.terminate).toHaveBeenCalledTimes(1)
  })

  it('does not ping sockets that are already closing', () => {
    const socket = fakeSocket()
    socket.readyState = WebSocket.CLOSING
    trackHeartbeat(socket as unknown as WebSocket)

    sweepHeartbeatSockets([socket as unknown as WebSocket])
    expect(socket.ping).not.toHaveBeenCalled()
    expect(socket.terminate).not.toHaveBeenCalled()
  })
})
