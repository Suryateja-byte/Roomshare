/**
 * Tests for useNetworkStatus hook
 */

import { renderHook, act } from '@testing-library/react'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'

describe('useNetworkStatus', () => {
  const setNavigatorOnLine = (value: boolean) => {
    Object.defineProperty(window.navigator, 'onLine', {
      value,
      writable: true,
      configurable: true,
    })
  }

  beforeEach(() => {
    // Default to online
    setNavigatorOnLine(true)
  })

  it('returns isOnline true when navigator is online', () => {
    setNavigatorOnLine(true)

    const { result } = renderHook(() => useNetworkStatus())

    expect(result.current.isOnline).toBe(true)
    expect(result.current.isOffline).toBe(false)
  })

  it('returns isOnline false when navigator is offline', () => {
    setNavigatorOnLine(false)

    const { result } = renderHook(() => useNetworkStatus())

    expect(result.current.isOnline).toBe(false)
    expect(result.current.isOffline).toBe(true)
  })

  it('updates to online when online event fires', () => {
    setNavigatorOnLine(false)

    const { result } = renderHook(() => useNetworkStatus())

    expect(result.current.isOnline).toBe(false)

    act(() => {
      window.dispatchEvent(new Event('online'))
    })

    expect(result.current.isOnline).toBe(true)
    expect(result.current.isOffline).toBe(false)
  })

  it('updates to offline when offline event fires', () => {
    setNavigatorOnLine(true)

    const { result } = renderHook(() => useNetworkStatus())

    expect(result.current.isOnline).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })

    expect(result.current.isOnline).toBe(false)
    expect(result.current.isOffline).toBe(true)
  })

  it('removes event listeners on unmount', () => {
    setNavigatorOnLine(true)
    const addEventListenerSpy = jest.spyOn(window, 'addEventListener')
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener')

    const { unmount } = renderHook(() => useNetworkStatus())

    expect(addEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function))
    expect(addEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function))

    unmount()

    expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function))
    expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function))

    addEventListenerSpy.mockRestore()
    removeEventListenerSpy.mockRestore()
  })

  it('handles multiple status changes', () => {
    setNavigatorOnLine(true)

    const { result } = renderHook(() => useNetworkStatus())

    expect(result.current.isOnline).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current.isOnline).toBe(false)

    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(result.current.isOnline).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current.isOnline).toBe(false)
  })

  it('provides both isOnline and isOffline properties', () => {
    setNavigatorOnLine(true)
    const { result } = renderHook(() => useNetworkStatus())

    expect(result.current).toHaveProperty('isOnline')
    expect(result.current).toHaveProperty('isOffline')
  })

  it('isOffline is always the inverse of isOnline', () => {
    setNavigatorOnLine(true)
    const { result } = renderHook(() => useNetworkStatus())

    expect(result.current.isOnline).toBe(!result.current.isOffline)

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })

    expect(result.current.isOnline).toBe(!result.current.isOffline)

    act(() => {
      window.dispatchEvent(new Event('online'))
    })

    expect(result.current.isOnline).toBe(!result.current.isOffline)
  })
})
