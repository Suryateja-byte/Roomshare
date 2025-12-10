/**
 * Tests for useFormPersistence hook
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { useFormPersistence, formatTimeSince } from '@/hooks/useFormPersistence'

// Mock use-debounce to execute immediately
jest.mock('use-debounce', () => ({
  useDebouncedCallback: (callback: (...args: unknown[]) => void) => callback,
}))

describe('useFormPersistence', () => {
  let mockStorage: Record<string, string>
  let originalLocalStorage: Storage

  beforeEach(() => {
    mockStorage = {}
    originalLocalStorage = window.localStorage

    // Create a mock localStorage
    const mockLocalStorage = {
      getItem: jest.fn((key: string) => mockStorage[key] || null),
      setItem: jest.fn((key: string, value: string) => {
        mockStorage[key] = value
      }),
      removeItem: jest.fn((key: string) => {
        delete mockStorage[key]
      }),
      clear: jest.fn(() => {
        mockStorage = {}
      }),
      length: 0,
      key: jest.fn(),
    }

    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    })
  })

  it('returns null persistedData when no data is stored', async () => {
    const { result } = renderHook(() =>
      useFormPersistence<{ name: string }>({ key: 'test-form' })
    )

    await waitFor(() => {
      expect(result.current.isHydrated).toBe(true)
    })

    expect(result.current.persistedData).toBeNull()
    expect(result.current.hasDraft).toBe(false)
    expect(result.current.savedAt).toBeNull()
  })

  it('loads persisted data from localStorage', async () => {
    const storedData = {
      data: { name: 'Test Name' },
      savedAt: Date.now() - 1000,
    }
    mockStorage['test-form'] = JSON.stringify(storedData)

    const { result } = renderHook(() =>
      useFormPersistence<{ name: string }>({ key: 'test-form' })
    )

    await waitFor(() => {
      expect(result.current.isHydrated).toBe(true)
    })

    expect(result.current.persistedData).toEqual({ name: 'Test Name' })
    expect(result.current.hasDraft).toBe(true)
  })

  it('saves data to localStorage', async () => {
    const { result } = renderHook(() =>
      useFormPersistence<{ name: string }>({ key: 'test-form' })
    )

    await waitFor(() => {
      expect(result.current.isHydrated).toBe(true)
    })

    act(() => {
      result.current.saveData({ name: 'New Name' })
    })

    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      'test-form',
      expect.stringContaining('New Name')
    )
  })

  it('clears persisted data', async () => {
    const storedData = {
      data: { name: 'Test Name' },
      savedAt: Date.now() - 1000,
    }
    mockStorage['test-form'] = JSON.stringify(storedData)

    const { result } = renderHook(() =>
      useFormPersistence<{ name: string }>({ key: 'test-form' })
    )

    await waitFor(() => {
      expect(result.current.isHydrated).toBe(true)
    })

    act(() => {
      result.current.clearPersistedData()
    })

    expect(window.localStorage.removeItem).toHaveBeenCalledWith('test-form')
    expect(result.current.persistedData).toBeNull()
    expect(result.current.hasDraft).toBe(false)
  })

  it('clears expired data on load', async () => {
    const storedData = {
      data: { name: 'Expired Data' },
      savedAt: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
    }
    mockStorage['test-form'] = JSON.stringify(storedData)

    const { result } = renderHook(() =>
      useFormPersistence<{ name: string }>({ key: 'test-form' })
    )

    await waitFor(() => {
      expect(result.current.isHydrated).toBe(true)
    })

    expect(result.current.persistedData).toBeNull()
    expect(window.localStorage.removeItem).toHaveBeenCalledWith('test-form')
  })

  it('respects custom expiration time', async () => {
    const storedData = {
      data: { name: 'Custom Expiration' },
      savedAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
    }
    mockStorage['test-form'] = JSON.stringify(storedData)

    // With 1 hour expiration, data should be expired
    const { result } = renderHook(() =>
      useFormPersistence<{ name: string }>({
        key: 'test-form',
        expirationMs: 60 * 60 * 1000, // 1 hour
      })
    )

    await waitFor(() => {
      expect(result.current.isHydrated).toBe(true)
    })

    expect(result.current.persistedData).toBeNull()
  })

  it('handles invalid JSON in localStorage gracefully', async () => {
    mockStorage['test-form'] = 'invalid json{'

    const { result } = renderHook(() =>
      useFormPersistence<{ name: string }>({ key: 'test-form' })
    )

    await waitFor(() => {
      expect(result.current.isHydrated).toBe(true)
    })

    expect(result.current.persistedData).toBeNull()
    expect(window.localStorage.removeItem).toHaveBeenCalledWith('test-form')
  })

  it('sets savedAt when saving data', async () => {
    const { result } = renderHook(() =>
      useFormPersistence<{ name: string }>({ key: 'test-form' })
    )

    await waitFor(() => {
      expect(result.current.isHydrated).toBe(true)
    })

    act(() => {
      result.current.saveData({ name: 'Test' })
    })

    expect(result.current.savedAt).toBeInstanceOf(Date)
  })

  it('preserves savedAt from loaded data', async () => {
    const savedTime = Date.now() - 5000
    const storedData = {
      data: { name: 'Test' },
      savedAt: savedTime,
    }
    mockStorage['test-form'] = JSON.stringify(storedData)

    const { result } = renderHook(() =>
      useFormPersistence<{ name: string }>({ key: 'test-form' })
    )

    await waitFor(() => {
      expect(result.current.isHydrated).toBe(true)
    })

    expect(result.current.savedAt?.getTime()).toBe(savedTime)
  })

  it('handles complex nested objects', async () => {
    const complexData = {
      user: { name: 'John', settings: { theme: 'dark' } },
      items: [1, 2, 3],
    }

    const { result } = renderHook(() =>
      useFormPersistence<typeof complexData>({ key: 'complex-form' })
    )

    await waitFor(() => {
      expect(result.current.isHydrated).toBe(true)
    })

    act(() => {
      result.current.saveData(complexData)
    })

    const savedData = JSON.parse(mockStorage['complex-form'])
    expect(savedData.data).toEqual(complexData)
  })

  it('returns isHydrated true after initial load', async () => {
    const { result } = renderHook(() =>
      useFormPersistence<{ name: string }>({ key: 'test-form' })
    )

    await waitFor(() => {
      expect(result.current.isHydrated).toBe(true)
    })
  })
})

describe('formatTimeSince', () => {
  it('returns "just now" for times less than 60 seconds ago', () => {
    const date = new Date(Date.now() - 30 * 1000) // 30 seconds ago
    expect(formatTimeSince(date)).toBe('just now')
  })

  it('returns singular minute for 1 minute ago', () => {
    const date = new Date(Date.now() - 60 * 1000)
    expect(formatTimeSince(date)).toBe('1 minute ago')
  })

  it('returns plural minutes for multiple minutes ago', () => {
    const date = new Date(Date.now() - 5 * 60 * 1000)
    expect(formatTimeSince(date)).toBe('5 minutes ago')
  })

  it('returns singular hour for 1 hour ago', () => {
    const date = new Date(Date.now() - 60 * 60 * 1000)
    expect(formatTimeSince(date)).toBe('1 hour ago')
  })

  it('returns plural hours for multiple hours ago', () => {
    const date = new Date(Date.now() - 3 * 60 * 60 * 1000)
    expect(formatTimeSince(date)).toBe('3 hours ago')
  })

  it('returns singular day for 1 day ago', () => {
    const date = new Date(Date.now() - 24 * 60 * 60 * 1000)
    expect(formatTimeSince(date)).toBe('1 day ago')
  })

  it('returns plural days for multiple days ago', () => {
    const date = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    expect(formatTimeSince(date)).toBe('3 days ago')
  })

  it('handles edge case at 59 seconds', () => {
    const date = new Date(Date.now() - 59 * 1000)
    expect(formatTimeSince(date)).toBe('just now')
  })

  it('handles edge case at 59 minutes', () => {
    const date = new Date(Date.now() - 59 * 60 * 1000)
    expect(formatTimeSince(date)).toBe('59 minutes ago')
  })

  it('handles edge case at 23 hours', () => {
    const date = new Date(Date.now() - 23 * 60 * 60 * 1000)
    expect(formatTimeSince(date)).toBe('23 hours ago')
  })
})
