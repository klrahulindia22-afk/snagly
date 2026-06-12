/**
 * Singleton WebSocket service.
 * Manages one persistent connection per browser tab.
 * Auto-reconnects with exponential backoff (1s → 2s → 4s … max 30s).
 * Sends a ping every 25s to keep the connection alive through proxies.
 */

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
// Derive WS URL from HTTP URL (http→ws, https→wss)
const WS_BASE = API_BASE.replace(/^http/, "ws");

// type → Set<handler>
const listeners = new Map();

let ws = null;
let currentToken = null;
let retryCount = 0;
let retryTimer = null;
let pingInterval = null;
let alive = false; // prevent reconnect after explicit disconnect

function _dispatch(msg) {
  const type = msg?.type;
  if (!type) return;
  (listeners.get(type) || new Set()).forEach((fn) => {
    try { fn(msg); } catch {}
  });
  (listeners.get("*") || new Set()).forEach((fn) => {
    try { fn(msg); } catch {}
  });
}

function _startPing() {
  _stopPing();
  pingInterval = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "ping" }));
    }
  }, 25_000);
}

function _stopPing() {
  if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
}

function connect(token) {
  if (!token) return;
  if (ws && ws.readyState === WebSocket.OPEN && token === currentToken) return;

  // Close any existing connection before opening a new one
  if (ws) { ws.onclose = null; ws.close(); }

  currentToken = token;
  alive = true;
  const url = `${WS_BASE}/api/v1/ws?token=${encodeURIComponent(token)}`;
  ws = new WebSocket(url);

  ws.onopen = () => {
    retryCount = 0;
    _startPing();
    _dispatch({ type: "ws.connected" });
  };

  ws.onmessage = (e) => {
    try {
      _dispatch(JSON.parse(e.data));
    } catch {}
  };

  ws.onclose = () => {
    _stopPing();
    _dispatch({ type: "ws.disconnected" });
    if (alive && currentToken) {
      const delay = Math.min(1_000 * 2 ** retryCount, 30_000);
      retryCount++;
      retryTimer = setTimeout(() => connect(currentToken), delay);
    }
  };

  ws.onerror = () => ws.close();
}

function disconnect() {
  alive = false;
  currentToken = null;
  _stopPing();
  clearTimeout(retryTimer);
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
  _dispatch({ type: "ws.disconnected" });
}

function send(msg) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function subscribe(type, handler) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(handler);
}

function unsubscribe(type, handler) {
  listeners.get(type)?.delete(handler);
}

function isConnected() {
  return ws?.readyState === WebSocket.OPEN;
}

export default { connect, disconnect, send, subscribe, unsubscribe, isConnected };
