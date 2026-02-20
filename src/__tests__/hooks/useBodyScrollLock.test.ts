import { renderHook } from '@testing-library/react'
import { useBodyScrollLock, _resetLockStateForTesting } from '@/hooks/useBodyScrollLock'

beforeEach(() => {
  _resetLockStateForTesting()
})

describe('useBodyScrollLock', () => {
  it('applies position:fixed on body when locked', () => {
    renderHook(() => useBodyScrollLock(true))
    expect(document.body.style.position).toBe('fixed')
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('removes position:fixed when unlocked', () => {
    const { rerender } = renderHook(
      ({ locked }) => useBodyScrollLock(locked),
      { initialProps: { locked: true } },
    )
    rerender({ locked: false })
    expect(document.body.style.position).toBe('')
    expect(document.body.style.overflow).toBe('')
  })

  it('preserves scroll position across lock/unlock cycle', () => {
    Object.defineProperty(window, 'scrollY', { value: 200, configurable: true })
    const scrollToSpy = jest.spyOn(window, 'scrollTo').mockImplementation(() => {})

    const { rerender } = renderHook(
      ({ locked }) => useBodyScrollLock(locked),
      { initialProps: { locked: true } },
    )
    expect(document.body.style.top).toBe('-200px')

    rerender({ locked: false })
    expect(scrollToSpy).toHaveBeenCalledWith(0, 200)
    scrollToSpy.mockRestore()
  })

  it('sets left:0 and right:0 to prevent horizontal shift', () => {
    renderHook(() => useBodyScrollLock(true))
    expect(document.body.style.left).toBe('0px')
    expect(document.body.style.right).toBe('0px')
  })

  it('ref-counts correctly with multiple concurrent consumers', () => {
    const hook1 = renderHook(
      ({ locked }) => useBodyScrollLock(locked),
      { initialProps: { locked: true } },
    )
    const hook2 = renderHook(
      ({ locked }) => useBodyScrollLock(locked),
      { initialProps: { locked: true } },
    )
    hook1.rerender({ locked: false })
    expect(document.body.style.position).toBe('fixed') // still locked by hook2

    hook2.rerender({ locked: false })
    expect(document.body.style.position).toBe('') // now unlocked
  })

  it('cleans up on unmount', () => {
    const { unmount } = renderHook(() => useBodyScrollLock(true))
    unmount()
    expect(document.body.style.position).toBe('')
  })
})
