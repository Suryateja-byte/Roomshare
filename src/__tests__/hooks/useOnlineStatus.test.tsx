import { renderHook, act } from '@testing-library/react'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'

describe('useOnlineStatus', () => {
  const originalNavigator = global.navigator

  beforeEach(() => {
    // Reset navigator.onLine to true
    Object.defineProperty(global, 'navigator', {
      value: { onLine: true },
      writable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
    })
  })

  it('should return true when online', () => {
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(true)
  })

  it('should return false when offline', () => {
    Object.defineProperty(global, 'navigator', {
      value: { onLine: false },
      writable: true,
    })

    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(false)
  })

  it('should update when going offline', () => {
    const { result } = renderHook(() => useOnlineStatus())

    expect(result.current).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })

    expect(result.current).toBe(false)
  })

  it('should update when coming back online', () => {
    Object.defineProperty(global, 'navigator', {
      value: { onLine: false },
      writable: true,
    })

    const { result } = renderHook(() => useOnlineStatus())

    expect(result.current).toBe(false)

    act(() => {
      window.dispatchEvent(new Event('online'))
    })

    expect(result.current).toBe(true)
  })

  it('should clean up event listeners on unmount', () => {
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener')

    const { unmount } = renderHook(() => useOnlineStatus())

    unmount()

    expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function))
    expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function))

    removeEventListenerSpy.mockRestore()
  })

  it('should add event listeners on mount', () => {
    const addEventListenerSpy = jest.spyOn(window, 'addEventListener')

    renderHook(() => useOnlineStatus())

    expect(addEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function))
    expect(addEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function))

    addEventListenerSpy.mockRestore()
  })

  it('should handle multiple status changes', () => {
    const { result } = renderHook(() => useOnlineStatus())

    expect(result.current).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current).toBe(false)

    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(result.current).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current).toBe(false)
  })

  it('should use navigator.onLine for initial state', () => {
    Object.defineProperty(global, 'navigator', {
      value: { onLine: false },
      writable: true,
    })

    const { result } = renderHook(() => useOnlineStatus())

    // Initial state should match navigator.onLine
    expect(result.current).toBe(false)
  })
})
