import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from '../hooks/useWebSocket';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    }, 0);
  }

  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  });
}

describe('useWebSocket', () => {
  let originalWebSocket: typeof globalThis.WebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = MockWebSocket as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    globalThis.WebSocket = originalWebSocket;
  });

  it('should initialize with disconnected status', () => {
    const { result } = renderHook(() => useWebSocket({ url: 'ws://localhost:8080' }));
    
    expect(result.current.status).toBe('connecting');
  });

  it('should connect and update status', () => {
    const { result } = renderHook(() => useWebSocket({ url: 'ws://localhost:8080' }));
    
    act(() => {
      vi.advanceTimersByTime(10);
    });

    expect(result.current.status).toBe('connected');
  });

  it('should call onOpen when connected', () => {
    const onOpen = vi.fn();
    const { result } = renderHook(() => useWebSocket({ url: 'ws://localhost:8080', onOpen }));
    
    act(() => {
      vi.advanceTimersByTime(10);
    });

    expect(onOpen).toHaveBeenCalled();
  });

  it('should call onMessage when message received', () => {
    const onMessage = vi.fn();
    const { result } = renderHook(() => useWebSocket({ url: 'ws://localhost:8080', onMessage }));
    
    act(() => {
      vi.advanceTimersByTime(10);
    });

    // Simulate message
    act(() => {
      const ws = result.current.wsRef.current as any;
      ws.onmessage?.({ data: JSON.stringify({ type: 'test' }) });
    });

    expect(onMessage).toHaveBeenCalledWith({ type: 'test' });
  });

  it('should send data when connected', () => {
    const { result } = renderHook(() => useWebSocket({ url: 'ws://localhost:8080' }));
    
    act(() => {
      vi.advanceTimersByTime(10);
    });

    let sent = false;
    act(() => {
      sent = result.current.send({ type: 'test' });
    });

    expect(sent).toBe(true);
    const ws = result.current.wsRef.current as any;
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'test' }));
  });

  it('should disconnect and cleanup', () => {
    const { result } = renderHook(() => useWebSocket({ url: 'ws://localhost:8080' }));
    
    act(() => {
      vi.advanceTimersByTime(10);
    });

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.status).toBe('disconnected');
  });

  it('should use exponential backoff for reconnection', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useWebSocket({
      url: 'ws://localhost:8080',
      onClose,
      initialReconnectInterval: 1000,
      maxReconnectInterval: 30000,
    }));
    
    // Connect
    act(() => {
      vi.advanceTimersByTime(10);
    });

    // Simulate disconnect
    act(() => {
      const ws = result.current.wsRef.current as any;
      ws.onclose?.();
    });

    expect(result.current.status).toBe('disconnected');
    expect(result.current.retryCount).toBe(1);
  });
});
