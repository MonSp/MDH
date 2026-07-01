import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScroll } from '../hooks/useScroll';

describe('useScroll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should return containerRef and scroll functions', () => {
    const { result } = renderHook(() => useScroll());
    
    expect(result.current.containerRef).toBeDefined();
    expect(result.current.scrollToBottom).toBeInstanceOf(Function);
    expect(result.current.forceScrollToBottom).toBeInstanceOf(Function);
  });

  it('should scroll to bottom when near bottom', () => {
    // Mock RAF
    let rafCallback: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallback = cb;
      return 1;
    });

    const { result } = renderHook(() => useScroll());
    
    // Mock the container element
    const mockElement = {
      scrollTop: 900,
      clientHeight: 100,
      scrollHeight: 1000,
    };
    
    // Set the ref
    Object.defineProperty(result.current.containerRef, 'current', {
      value: mockElement,
      writable: true,
    });

    // Call scrollToBottom
    act(() => {
      result.current.scrollToBottom();
    });

    // Execute RAF callback
    act(() => {
      rafCallback?.(0);
    });

    expect(mockElement.scrollTop).toBe(1000);
  });

  it('should not scroll when not near bottom', () => {
    const { result } = renderHook(() => useScroll());
    
    // Mock the container element - user has scrolled up
    const mockElement = {
      scrollTop: 500,
      clientHeight: 100,
      scrollHeight: 1000,
    };
    
    Object.defineProperty(result.current.containerRef, 'current', {
      value: mockElement,
      writable: true,
    });

    act(() => {
      result.current.scrollToBottom();
    });

    // Should not scroll
    expect(mockElement.scrollTop).toBe(500);
  });

  it('should force scroll to bottom', () => {
    const { result } = renderHook(() => useScroll());
    
    const mockElement = {
      scrollTop: 0,
      clientHeight: 100,
      scrollHeight: 1000,
    };
    
    Object.defineProperty(result.current.containerRef, 'current', {
      value: mockElement,
      writable: true,
    });

    act(() => {
      result.current.forceScrollToBottom();
    });

    // forceScrollToBottom uses setTimeout(50)
    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(mockElement.scrollTop).toBe(1000);
  });
});
