/**
 * Tests for useNavigationGuard hook
 *
 * Covers: beforeunload, pushState interception, popstate handling,
 * dialog state (onStay/onLeave), cleanup, and StrictMode safety.
 */

import { renderHook, act } from '@testing-library/react'
import { useNavigationGuard } from '@/hooks/useNavigationGuard'

// The hook captures window.history.pushState at module load time as nativePushState.
// Spy on it to track calls without breaking it.
const nativePushStateSpy = jest.spyOn(window.history, 'pushState')

beforeEach(() => {
  nativePushStateSpy.mockClear()
  // Navigate to a known location using jsdom's built-in mechanism
  window.history.pushState({}, '', 'http://localhost/listings/create')
})

afterAll(() => {
  nativePushStateSpy.mockRestore()
})

describe('useNavigationGuard', () => {
  it('returns initial state correctly', () => {
    const msg = 'You have unsaved changes'
    const { result, unmount } = renderHook(() => useNavigationGuard(false, msg))

    expect(result.current.showDialog).toBe(false)
    expect(result.current.message).toBe(msg)
    expect(typeof result.current.onStay).toBe('function')
    expect(typeof result.current.onLeave).toBe('function')

    unmount()
  })

  it('adds beforeunload listener when shouldBlock=true', () => {
    const addSpy = jest.spyOn(window, 'addEventListener')

    const { unmount } = renderHook(() => useNavigationGuard(true, 'unsaved'))

    const beforeUnloadCalls = addSpy.mock.calls.filter(
      ([event]) => event === 'beforeunload'
    )
    expect(beforeUnloadCalls.length).toBeGreaterThanOrEqual(1)

    unmount()
    addSpy.mockRestore()
  })

  it('removes beforeunload listener when shouldBlock changes to false', () => {
    const removeSpy = jest.spyOn(window, 'removeEventListener')

    const { rerender, unmount } = renderHook(
      ({ block }) => useNavigationGuard(block, 'unsaved'),
      { initialProps: { block: true } }
    )

    removeSpy.mockClear()
    rerender({ block: false })

    const beforeUnloadRemoves = removeSpy.mock.calls.filter(
      ([event]) => event === 'beforeunload'
    )
    expect(beforeUnloadRemoves.length).toBeGreaterThanOrEqual(1)

    unmount()
    removeSpy.mockRestore()
  })

  it('pushState interception blocks cross-pathname navigation', () => {
    const { result, unmount } = renderHook(() => useNavigationGuard(true, 'unsaved'))

    // The hook patches window.history.pushState — call it with a different path
    act(() => {
      window.history.pushState(null, '', '/other-page')
    })

    expect(result.current.showDialog).toBe(true)

    unmount()
  })

  it('pushState allows same-pathname navigation', () => {
    const { result, unmount } = renderHook(() => useNavigationGuard(true, 'unsaved'))

    // Navigate to same pathname with a query param change
    act(() => {
      window.history.pushState(null, '', '/listings/create?step=2')
    })

    expect(result.current.showDialog).toBe(false)

    unmount()
  })

  it('onStay closes dialog', () => {
    const { result, unmount } = renderHook(() => useNavigationGuard(true, 'unsaved'))

    // Trigger dialog via cross-pathname navigation
    act(() => {
      window.history.pushState(null, '', '/other-page')
    })
    expect(result.current.showDialog).toBe(true)

    act(() => {
      result.current.onStay()
    })
    expect(result.current.showDialog).toBe(false)

    unmount()
  })

  it('onLeave closes dialog and navigates away', () => {
    const { result, unmount } = renderHook(() => useNavigationGuard(true, 'unsaved'))

    // Trigger dialog via cross-pathname navigation
    act(() => {
      window.history.pushState(null, '', '/other-page')
    })
    expect(result.current.showDialog).toBe(true)

    act(() => {
      result.current.onLeave()
    })

    // Dialog should be closed after onLeave
    expect(result.current.showDialog).toBe(false)
    // The hook calls nativePushState (the module-level bound copy) which
    // bypasses the spy but actually navigates in jsdom. Verify the URL changed.
    expect(window.location.pathname).toBe('/other-page')

    unmount()
  })

  it('popstate handler shows dialog', () => {
    const { result, unmount } = renderHook(() => useNavigationGuard(true, 'unsaved'))

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    })

    expect(result.current.showDialog).toBe(true)

    unmount()
  })

  it('cleanup restores original pushState on unmount', () => {
    // Capture the patched pushState while the guard is active
    const { unmount } = renderHook(() => useNavigationGuard(true, 'unsaved'))
    const patchedPushState = window.history.pushState

    unmount()

    // After unmounting the last guard, pushState should no longer be the patched version.
    // The hook restores nativePushState (the module-level bound copy).
    expect(window.history.pushState).not.toBe(patchedPushState)
    // Verify it still works — calling pushState should not trigger a dialog
    window.history.pushState(null, '', '/test-after-cleanup')
    expect(window.location.pathname).toBe('/test-after-cleanup')
  })

  it('StrictMode double-mount safety — mount/unmount/mount works correctly', () => {
    // Simulate StrictMode: mount -> unmount -> mount
    const { unmount: unmount1 } = renderHook(() =>
      useNavigationGuard(true, 'unsaved')
    )
    unmount1()

    // Second mount should work without error
    const { result, unmount: unmount2 } = renderHook(() =>
      useNavigationGuard(true, 'unsaved')
    )

    // Should still function: trigger dialog via popstate
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    })
    expect(result.current.showDialog).toBe(true)

    unmount2()
  })

  it('disable() immediately prevents pushState interception', () => {
    const { result, unmount } = renderHook(() => useNavigationGuard(true, 'unsaved'))

    // Imperatively disable the guard
    act(() => {
      result.current.disable()
    })

    // Cross-pathname push should now go through without showing dialog
    act(() => {
      window.history.pushState(null, '', '/other-page')
    })

    expect(result.current.showDialog).toBe(false)

    unmount()
  })

  it('does not add listeners when shouldBlock=false', () => {
    const addSpy = jest.spyOn(window, 'addEventListener')

    const { unmount } = renderHook(() => useNavigationGuard(false, 'unsaved'))

    const beforeUnloadCalls = addSpy.mock.calls.filter(
      ([event]) => event === 'beforeunload'
    )
    expect(beforeUnloadCalls).toHaveLength(0)

    unmount()
    addSpy.mockRestore()
  })
})
