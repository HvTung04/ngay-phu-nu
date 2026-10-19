export function connect(onMessage, onStatus = () => {}) {
  let ws = null
  let closed = false
  let retry = 0

  function open() {
    if (closed) return
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    ws = new WebSocket(`${proto}//${location.host}`)

    ws.addEventListener('open', () => {
      retry = 0
      onStatus('online')
    })

    ws.addEventListener('message', (event) => {
      let msg
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }
      onMessage(msg)
    })

    ws.addEventListener('close', () => {
      onStatus('offline')
      if (closed) return
      retry += 1
      setTimeout(open, Math.min(500 * retry, 4000))
    })

    ws.addEventListener('error', () => ws.close())
  }

  open()

  return {
    send(value) {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value))
    },
    close() {
      closed = true
      if (ws) ws.close()
    },
  }
}

export function playerId() {
  const KEY = 'ngay-phu-nu:id'
  let id = localStorage.getItem(KEY)
  if (!id) {
    id = 'p-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
    localStorage.setItem(KEY, id)
  }
  return id
}