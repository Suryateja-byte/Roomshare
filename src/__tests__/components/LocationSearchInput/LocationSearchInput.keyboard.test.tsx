/**
 * LocationSearchInput - Keyboard Navigation Tests
 *
 * Tests WAI-ARIA combobox keyboard navigation including ArrowDown/Up,
 * Enter, Escape, Tab, and aria-activedescendant management.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LocationSearchInput from '@/components/LocationSearchInput';
import { clearCache } from '@/lib/geocoding-cache';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock environment variable
const MOCK_MAPBOX_TOKEN = 'pk.test_token_12345';
const originalEnv = process.env;

beforeAll(() => {
  process.env = {
    ...originalEnv,
    NEXT_PUBLIC_MAPBOX_TOKEN: MOCK_MAPBOX_TOKEN,
  };
});

afterAll(() => {
  process.env = originalEnv;
});

const mockSuggestions = [
  { id: '1', place_name: 'San Francisco, CA, USA', center: [-122.4194, 37.7749], place_type: ['place'] },
  { id: '2', place_name: 'San Jose, CA, USA', center: [-121.8863, 37.3382], place_type: ['place'] },
  { id: '3', place_name: 'San Diego, CA, USA', center: [-117.1611, 32.7157], place_type: ['place'] },
];

// Stateful wrapper for controlled component testing
const ControlledLocationInput = ({
  onLocationSelect,
  initialValue = '',
  ...props
}: {
  onLocationSelect?: (location: { name: string; lat: number; lng: number; bbox?: number[] }) => void;
  initialValue?: string;
} & Partial<React.ComponentProps<typeof LocationSearchInput>>) => {
  const [value, setValue] = React.useState(initialValue);
  return (
    <LocationSearchInput
      value={value}
      onChange={setValue}
      onLocationSelect={onLocationSelect}
      {...props}
    />
  );
};

describe('LocationSearchInput - Keyboard Navigation', () => {
  const user = userEvent.setup({ delay: null });
  const mockOnLocationSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ advanceTimers: true });
    clearCache();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ features: mockSuggestions }),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const renderInput = (props = {}) => {
    return render(
      <ControlledLocationInput
        onLocationSelect={mockOnLocationSelect}
        {...props}
      />
    );
  };

  const setupWithSuggestions = async () => {
    renderInput();
    const input = screen.getByRole('combobox');

    await user.type(input, 'San');
    jest.advanceTimersByTime(350);

    await waitFor(() => {
      // Place name may be split across elements, search for partial match
      expect(screen.getByText('San Francisco')).toBeInTheDocument();
    });

    return input;
  };

  describe('ArrowDown Navigation', () => {
    it('opens dropdown and highlights first item when closed', async () => {
      const input = await setupWithSuggestions();

      // Close dropdown by pressing Escape first
      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });

      // ArrowDown should open and highlight first
      await user.keyboard('{ArrowDown}');

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      const options = screen.getAllByRole('option');
      expect(options[0]).toHaveAttribute('aria-selected', 'true');
    });

    it('moves highlight down through options', async () => {
      const input = await setupWithSuggestions();

      // First ArrowDown
      await user.keyboard('{ArrowDown}');
      let options = screen.getAllByRole('option');
      expect(options[0]).toHaveAttribute('aria-selected', 'true');

      // Second ArrowDown
      await user.keyboard('{ArrowDown}');
      options = screen.getAllByRole('option');
      expect(options[0]).toHaveAttribute('aria-selected', 'false');
      expect(options[1]).toHaveAttribute('aria-selected', 'true');

      // Third ArrowDown
      await user.keyboard('{ArrowDown}');
      options = screen.getAllByRole('option');
      expect(options[2]).toHaveAttribute('aria-selected', 'true');
    });

    it('stops at the last option (does not wrap)', async () => {
      await setupWithSuggestions();

      // Navigate to last option
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{ArrowDown}');

      // Try to go past last
      await user.keyboard('{ArrowDown}');

      const options = screen.getAllByRole('option');
      // Should stay on last option
      expect(options[2]).toHaveAttribute('aria-selected', 'true');
    });
  });

  describe('ArrowUp Navigation', () => {
    it('moves highlight up through options', async () => {
      await setupWithSuggestions();

      // Navigate to third option
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{ArrowDown}');

      // Move up
      await user.keyboard('{ArrowUp}');
      let options = screen.getAllByRole('option');
      expect(options[1]).toHaveAttribute('aria-selected', 'true');

      await user.keyboard('{ArrowUp}');
      options = screen.getAllByRole('option');
      expect(options[0]).toHaveAttribute('aria-selected', 'true');
    });

    it('stops at the first option (does not wrap)', async () => {
      await setupWithSuggestions();

      await user.keyboard('{ArrowDown}');
      await user.keyboard('{ArrowUp}');
      await user.keyboard('{ArrowUp}');

      const options = screen.getAllByRole('option');
      // Verify no wrapping to last option - should stay at first or clear highlight
      expect(options[2]).toHaveAttribute('aria-selected', 'false');
      // Either first is selected or no option is selected (component clears highlight on boundary)
      const firstSelected = options[0].getAttribute('aria-selected') === 'true';
      const noneSelected = options.every(opt => opt.getAttribute('aria-selected') === 'false');
      expect(firstSelected || noneSelected).toBe(true);
    });
  });

  describe('Enter Key', () => {
    it('selects highlighted option', async () => {
      await setupWithSuggestions();

      await user.keyboard('{ArrowDown}');
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{Enter}');

      expect(mockOnLocationSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'San Jose, CA, USA',
          lat: 37.3382,
          lng: -121.8863,
        })
      );
    });

    it('does nothing when no option is highlighted', async () => {
      await setupWithSuggestions();

      await user.keyboard('{Enter}');

      expect(mockOnLocationSelect).not.toHaveBeenCalled();
    });

    it('closes dropdown after selection', async () => {
      await setupWithSuggestions();

      await user.keyboard('{ArrowDown}');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });
  });

  describe('Escape Key', () => {
    it('closes dropdown', async () => {
      await setupWithSuggestions();

      expect(screen.getByRole('listbox')).toBeInTheDocument();

      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });

    it('clears highlight when closing', async () => {
      await setupWithSuggestions();

      await user.keyboard('{ArrowDown}');
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{Escape}');

      // Reopen
      await user.keyboard('{ArrowDown}');

      await waitFor(() => {
        const options = screen.getAllByRole('option');
        // First item should be highlighted (fresh start)
        expect(options[0]).toHaveAttribute('aria-selected', 'true');
      });
    });
  });

  describe('Tab Key', () => {
    it('selects highlighted option and closes', async () => {
      await setupWithSuggestions();

      await user.keyboard('{ArrowDown}');
      await user.tab();

      expect(mockOnLocationSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'San Francisco, CA, USA',
        })
      );

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });

    it('just closes if no option is highlighted', async () => {
      await setupWithSuggestions();

      await user.tab();

      expect(mockOnLocationSelect).not.toHaveBeenCalled();

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });

    it('does not prevent default (allows focus to move)', async () => {
      const { container } = renderInput();

      // Add a focusable element after
      const button = document.createElement('button');
      button.textContent = 'Next';
      container.appendChild(button);

      const input = screen.getByRole('combobox');
      input.focus();

      await user.type(input, 'San');
      jest.advanceTimersByTime(350);

      await waitFor(() => {
        expect(screen.getByText('San Francisco')).toBeInTheDocument();
      });

      await user.tab();

      // Focus should have moved away from the input (Tab was not prevented)
      // The component may have internal focusable elements (like a Clear button)
      expect(document.activeElement).not.toBe(input);
    });
  });

  describe('aria-activedescendant', () => {
    it('updates with arrow navigation', async () => {
      await setupWithSuggestions();
      const input = screen.getByRole('combobox');

      // Initially no activedescendant
      expect(input).not.toHaveAttribute('aria-activedescendant');

      await user.keyboard('{ArrowDown}');
      // Component uses dynamic ID prefix, check for option-0 suffix
      expect(input.getAttribute('aria-activedescendant')).toMatch(/option-0$/);

      await user.keyboard('{ArrowDown}');
      expect(input.getAttribute('aria-activedescendant')).toMatch(/option-1$/);
    });

    it('clears when dropdown closes', async () => {
      await setupWithSuggestions();
      const input = screen.getByRole('combobox');

      await user.keyboard('{ArrowDown}');
      expect(input).toHaveAttribute('aria-activedescendant');

      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(input).not.toHaveAttribute('aria-activedescendant');
      });
    });
  });

  describe('ARIA Attributes', () => {
    it('has role="combobox"', () => {
      renderInput();
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('has aria-expanded=false when closed', () => {
      renderInput();
      expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
    });

    it('has aria-expanded=true when open', async () => {
      await setupWithSuggestions();
      expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true');
    });

    it('has aria-controls pointing to listbox', async () => {
      await setupWithSuggestions();
      const input = screen.getByRole('combobox');
      const listbox = screen.getByRole('listbox');

      expect(input).toHaveAttribute('aria-controls', listbox.id);
    });

    it('listbox options have role="option"', async () => {
      await setupWithSuggestions();
      const options = screen.getAllByRole('option');

      expect(options).toHaveLength(3);
      options.forEach((option) => {
        expect(option).toHaveAttribute('role', 'option');
      });
    });

    it('options have unique IDs', async () => {
      await setupWithSuggestions();
      const options = screen.getAllByRole('option');

      const ids = options.map((opt) => opt.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('Click Selection', () => {
    it('selects option on click', async () => {
      await setupWithSuggestions();

      // Place name is split across elements, use partial match
      const option = screen.getByText('San Diego');
      await user.click(option);

      expect(mockOnLocationSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'San Diego, CA, USA',
        })
      );
    });

    it('closes dropdown after click selection', async () => {
      await setupWithSuggestions();

      // Place name is split across elements, use partial match
      const option = screen.getByText('San Jose');
      await user.click(option);

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });
  });

  describe('Focus Management', () => {
    it('keeps focus on input during keyboard navigation', async () => {
      await setupWithSuggestions();
      const input = screen.getByRole('combobox');

      input.focus();
      expect(document.activeElement).toBe(input);

      await user.keyboard('{ArrowDown}');
      expect(document.activeElement).toBe(input);

      await user.keyboard('{ArrowDown}');
      expect(document.activeElement).toBe(input);
    });
  });
});
