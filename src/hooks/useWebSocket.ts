import { useState, useRef, useCallback, useEffect } from 'react';

type WsStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface UseWebSocketOptions {
  url: string;
  onMessage?: (msg: any) => void;
  onOpen?: () => void;
  onClose?: () => void;
  reconnectInterval?: number;
}

export function useWebSocket({ url, onMessage, onOpen, onClose, reconnectInterval = 3000 }: UseWebSocketOptions) {
  const [status, setStatus] = useState<WsStatus>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        onOpen?.();
      };

      ws.onclose = () => {
        setStatus('disconnected');
        onClose?.();
        reconnectTimerRef.current = setTimeout(connect, reconnectInterval);
      };

      ws.onerror = () => setStatus('error');

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          onMessage?.(msg);
        } catch (e) {
          console.error('[WebSocket] Failed to parse message:', e);
        }
      };
    } catch {
      setStatus('error');
      reconnectTimerRef.current = setTimeout(connect, reconnectInterval);
    }
  }, [url, onMessage, onOpen, onClose, reconnectInterval]);

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

  return { status, send, connect, disconnect, wsRef };
}
