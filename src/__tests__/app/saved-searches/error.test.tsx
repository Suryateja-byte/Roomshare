import React from 'react'
import { render, screen } from '@testing-library/react'

jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>
  }
})

jest.mock('lucide-react', () => ({
  RefreshCw: ({ className }: { className?: string }) => <span data-testid="icon-refresh" className={className} />,
  Search: ({ className }: { className?: string }) => <span data-testid="icon-search" className={className} />,
}))

import SavedSearchesError from '@/app/saved-searches/error'

describe('SavedSearchesError', () => {
  const mockReset = jest.fn()

  it('does NOT render error.message to the user', () => {
    const dangerousMessage = 'PrismaClientKnownRequestError: Invalid `prisma.savedSearch.findMany()`'
    const error = new Error(dangerousMessage) as Error & { digest?: string }

    render(<SavedSearchesError error={error} reset={mockReset} />)

    expect(screen.queryByText(/PrismaClient/)).not.toBeInTheDocument()
  })

  it('renders the static fallback message', () => {
    const error = new Error('db error') as Error & { digest?: string }
    render(<SavedSearchesError error={error} reset={mockReset} />)

    expect(
      screen.getByText('We encountered an error while loading your saved searches. Please try again.')
    ).toBeInTheDocument()
  })
})
