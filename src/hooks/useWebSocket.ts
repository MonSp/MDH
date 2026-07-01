import { useState, useRef, useCallback, useEffect } from 'react';

type WsStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface UseWebSocketOptions {
  url: string;
  onMessage?: (msg: any) => void;
  onOpen?: () => void;
  onClose?: () => void;
  initialReconnectInterval?: number;
  maxReconnectInterval?: number;
  maxRetries?: number;
  /** 会话 ID，用于断线重连时恢复会话状态 */
  sessionId?: string;
}

export function useWebSocket({
  url,
  onMessage,
  onOpen,
  onClose,
  initialReconnectInterval = 1000,
  maxReconnectInterval = 30000,
  maxRetries = Infinity,
  sessionId,
}: UseWebSocketOptions) {
  const [status, setStatus] = useState<WsStatus>('disconnected');
  const [retryCount, setRetryCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const sessionIdRef = useRef<string | undefined>(sessionId);

  const getBackoffDelay = useCallback((attempt: number) => {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
    const delay = Math.min(initialReconnectInterval * Math.pow(2, attempt), maxReconnectInterval);
    // Add jitter (±25%) to prevent thundering herd
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    return Math.max(0, delay + jitter);
  }, [initialReconnectInterval, maxReconnectInterval]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (retryCountRef.current >= maxRetries) {
      console.warn(`[WebSocket] Max retries (${maxRetries}) reached`);
      return;
    }

    setStatus('connecting');
    try {
      // 重连时带上 sessionId 以恢复会话
      const connectUrl = sessionIdRef.current
        ? `${url}?session=${sessionIdRef.current}`
        : url;
      const ws = new WebSocket(connectUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        retryCountRef.current = 0;
        setRetryCount(0);
        onOpen?.();
      };

      ws.onclose = () => {
        setStatus('disconnected');
        onClose?.();
        
        const attempt = retryCountRef.current;
        const delay = getBackoffDelay(attempt);
        retryCountRef.current = attempt + 1;
        setRetryCount(attempt + 1);
        
        console.log(`[WebSocket] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${attempt + 1})`);
        reconnectTimerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => setStatus('error');

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          // 保存服务端分配的 sessionId
          if (msg.type === 'connected' && msg.session_id) {
            sessionIdRef.current = msg.session_id;
          }
          onMessage?.(msg);
        } catch (e) {
          console.error('[WebSocket] Failed to parse message:', e);
        }
      };
    } catch {
      setStatus('error');
      const attempt = retryCountRef.current;
      const delay = getBackoffDelay(attempt);
      retryCountRef.current = attempt + 1;
      setRetryCount(attempt + 1);
      
      reconnectTimerRef.current = setTimeout(connect, delay);
    }
  }, [url, onMessage, onOpen, onClose, maxRetries, getBackoffDelay]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('disconnected');
    retryCountRef.current = 0;
    setRetryCount(0);
  }, []);

  const send = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(typeof data === 'string' ? data : JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    connect();
    return disconnect;
  }, [connect, disconnect]);

  return { status, send, connect, disconnect, wsRef, retryCount };
}
