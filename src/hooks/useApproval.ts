import { useState, useRef, useCallback } from 'react';
import { ApprovalQueue } from '../modules/approvalQueue';
import type { ApprovalRequestInfo, RiskLevel } from '../modules/meetingProtocol';

interface UseApprovalOptions {
  onApprove?: (requestId: string, reason?: string) => void;
  onReject?: (requestId: string, reason?: string) => void;
}

export function useApproval({ onApprove, onReject }: UseApprovalOptions = {}) {
  const [currentRequest, setCurrentRequest] = useState<ApprovalRequestInfo | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const queueRef = useRef<ApprovalQueue>(new ApprovalQueue());
  const callbacksRef = useRef<Map<string, { resolve: (v: any) => void }>>(new Map());

  const processNext = useCallback(() => {
    const next = queueRef.current.getNextRequest();
    setCurrentRequest(next?.request ?? null);
    setPendingCount(queueRef.current.getPendingCount());
  }, []);

  const addRequest = useCallback((request: ApprovalRequestInfo) => {
    const priority = request.riskLevel === 'critical' ? 100
      : request.riskLevel === 'high' ? 80
      : request.riskLevel === 'medium' ? 50
      : 20;
    queueRef.current.addRequest(request, priority);
    if (!currentRequest) processNext();
    setPendingCount(queueRef.current.getPendingCount());
  }, [currentRequest, processNext]);

  const approve = useCallback((requestId: string, reason?: string) => {
    queueRef.current.approveRequest(requestId, reason);
    const cb = callbacksRef.current.get(requestId);
    if (cb) {
      cb.resolve({ confirmed: true, reason });
      callbacksRef.current.delete(requestId);
    }
    processNext();
    onApprove?.(requestId, reason);
  }, [processNext, onApprove]);

  const reject = useCallback((requestId: string, reason?: string) => {
    queueRef.current.rejectRequest(requestId, reason);
    const cb = callbacksRef.current.get(requestId);
    if (cb) {
      cb.resolve({ rejected: true, reason });
      callbacksRef.current.delete(requestId);
    }
    processNext();
    onReject?.(requestId, reason);
  }, [processNext, onReject]);

  const close = useCallback(() => {
    setCurrentRequest(null);
  }, []);

  const waitForDecision = useCallback((requestId: string): Promise<any> => {
    return new Promise((resolve) => {
      callbacksRef.current.set(requestId, { resolve });
    });
  }, []);

  return {
    currentRequest,
    pendingCount,
    addRequest,
    approve,
    reject,
    close,
    waitForDecision,
    queueRef,
  };
}
