import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useApproval } from '../hooks/useApproval';
import type { ApprovalRequestInfo } from '../modules/meetingProtocol';

describe('useApproval', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const createRequest = (id: string, riskLevel: string = 'medium'): ApprovalRequestInfo => ({
    id,
    requesterId: 'agent-test',
    operation: 'test-operation',
    description: 'Test operation',
    riskLevel: riskLevel as any,
    confidence: 0.8,
    status: 'pending',
    createdAt: Date.now(),
  });

  it('should initialize with no current request and zero pending count', () => {
    const { result } = renderHook(() => useApproval());
    
    expect(result.current.currentRequest).toBeNull();
    expect(result.current.pendingCount).toBe(0);
  });

  it('should add a request and set it as current', () => {
    const { result } = renderHook(() => useApproval());
    
    act(() => {
      result.current.addRequest(createRequest('req-1'));
    });

    expect(result.current.currentRequest).not.toBeNull();
    expect(result.current.currentRequest?.id).toBe('req-1');
    expect(result.current.pendingCount).toBe(1);
  });

  it('should approve a request', () => {
    const onApprove = vi.fn();
    const { result } = renderHook(() => useApproval({ onApprove }));
    
    act(() => {
      result.current.addRequest(createRequest('req-1'));
    });

    act(() => {
      result.current.approve('req-1', 'Approved for testing');
    });

    expect(onApprove).toHaveBeenCalledWith('req-1', 'Approved for testing');
    expect(result.current.currentRequest).toBeNull();
    expect(result.current.pendingCount).toBe(0);
  });

  it('should reject a request', () => {
    const onReject = vi.fn();
    const { result } = renderHook(() => useApproval({ onReject }));
    
    act(() => {
      result.current.addRequest(createRequest('req-1'));
    });

    act(() => {
      result.current.reject('req-1', 'Rejected for testing');
    });

    expect(onReject).toHaveBeenCalledWith('req-1', 'Rejected for testing');
    expect(result.current.currentRequest).toBeNull();
    expect(result.current.pendingCount).toBe(0);
  });

  it('should process multiple requests in priority order', () => {
    const { result } = renderHook(() => useApproval());
    
    act(() => {
      result.current.addRequest(createRequest('req-low', 'low'));
      result.current.addRequest(createRequest('req-high', 'high'));
      result.current.addRequest(createRequest('req-critical', 'critical'));
    });

    // Critical should be first
    expect(result.current.currentRequest?.id).toBe('req-critical');
    expect(result.current.pendingCount).toBe(3);

    // Approve critical
    act(() => {
      result.current.approve('req-critical');
    });

    // High should be next
    expect(result.current.currentRequest?.id).toBe('req-high');
    expect(result.current.pendingCount).toBe(2);
  });

  it('should resolve waitForDecision when approved', async () => {
    const { result } = renderHook(() => useApproval());
    
    act(() => {
      result.current.addRequest(createRequest('req-1'));
    });

    let decisionPromise: Promise<any>;
    act(() => {
      decisionPromise = result.current.waitForDecision('req-1');
    });

    act(() => {
      result.current.approve('req-1', 'Approved');
    });

    const decision = await decisionPromise!;
    expect(decision.confirmed).toBe(true);
    expect(decision.reason).toBe('Approved');
  });

  it('should close the current request dialog', () => {
    const { result } = renderHook(() => useApproval());
    
    act(() => {
      result.current.addRequest(createRequest('req-1'));
    });

    expect(result.current.currentRequest).not.toBeNull();

    act(() => {
      result.current.close();
    });

    expect(result.current.currentRequest).toBeNull();
  });
});
