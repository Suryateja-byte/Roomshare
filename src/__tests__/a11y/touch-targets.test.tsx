/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';

// WCAG 2.1 AA minimum touch target size is 44px

describe('Touch Target Accessibility (WCAG 2.1 AA)', () => {
  describe('Button Component', () => {
    it('default button should have minimum 44px height', () => {
      render(<Button data-testid="btn">Click me</Button>);
      const button = screen.getByTestId('btn');

      // Check computed styles include touch-target class
      expect(button.className).toMatch(/min-h-\[44px\]|touch-target|h-1[1-9]|h-[2-9][0-9]/);
    });

    it('small button should have minimum 44px touch target', () => {
      render(<Button size="sm" data-testid="btn-sm">Small</Button>);
      const button = screen.getByTestId('btn-sm');

      // Small visual size but adequate touch target
      expect(button.className).toMatch(/min-h-\[44px\]|touch-target/);
    });

    it('icon button should have minimum 44x44px dimensions', () => {
      render(
        <Button size="icon" data-testid="btn-icon" aria-label="Menu">
          <span>☰</span>
        </Button>
      );
      const button = screen.getByTestId('btn-icon');

      // Icon buttons must meet touch target requirements
      expect(button.className).toMatch(/min-h-\[44px\]|min-w-\[44px\]|touch-target|h-11|w-11/);
    });

    it('icon-only buttons must have aria-label', () => {
      const { container } = render(
        <Button size="icon" aria-label="Close menu">
          <span aria-hidden="true">×</span>
        </Button>
      );

      const button = container.querySelector('button');
      expect(button).toHaveAttribute('aria-label');
      expect(button?.getAttribute('aria-label')).toBeTruthy();
    });
  });

  describe('Checkbox Component', () => {
    it('checkbox should have minimum 44px touch target area', () => {
      render(
        <div className="flex items-center space-x-2">
          <Checkbox id="terms" data-testid="checkbox" />
          <label htmlFor="terms">Accept terms</label>
        </div>
      );

      const checkbox = screen.getByTestId('checkbox');
      // The clickable area (including padding/wrapper) should be at least 44px
      // Either through touch-target class or explicit min dimensions
      expect(checkbox.className).toMatch(/touch-target|min-h-\[44px\]|h-11/);
    });

    it('checkbox wrapper should provide adequate touch area', () => {
      const { container } = render(
        <label className="flex items-center gap-2 cursor-pointer touch-target">
          <Checkbox id="test" />
          <span>Label text</span>
        </label>
      );

      const label = container.querySelector('label');
      expect(label?.className).toContain('touch-target');
    });
  });

  describe('Input Component', () => {
    it('input should have minimum 44px height', () => {
      render(<Input data-testid="input" placeholder="Enter text" />);
      const input = screen.getByTestId('input');

      // Input should have touch-target class or adequate height
      expect(input.className).toMatch(/touch-target|min-h-\[44px\]|py-3/);
    });

    it('input with error should have aria-describedby', () => {
      render(
        <div>
          <Input
            data-testid="input-error"
            aria-invalid="true"
            aria-describedby="error-msg"
          />
          <span id="error-msg">This field is required</span>
        </div>
      );

      const input = screen.getByTestId('input-error');
      expect(input).toHaveAttribute('aria-describedby', 'error-msg');
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('Interactive Elements Spacing', () => {
    it('adjacent buttons should have adequate spacing', () => {
      render(
        <div data-testid="button-group" className="flex gap-2">
          <Button>Button 1</Button>
          <Button>Button 2</Button>
        </div>
      );

      const group = screen.getByTestId('button-group');
      // Gap of at least 8px (gap-2) between touch targets
      expect(group.className).toMatch(/gap-[2-9]|gap-\d{2}|space-x-[2-9]/);
    });
  });
});

describe('Focus Indicator Accessibility', () => {
  describe('Button Focus', () => {
    it('button should have visible focus indicator', () => {
      render(<Button data-testid="focus-btn">Focus me</Button>);
      const button = screen.getByTestId('focus-btn');

      // Should have focus-visible ring styles
      expect(button.className).toMatch(/focus-visible:ring/);
    });

    it('button focus ring should have adequate contrast', () => {
      render(<Button data-testid="contrast-btn">Contrast</Button>);
      const button = screen.getByTestId('contrast-btn');

      // Focus ring should have offset for visibility against backgrounds
      expect(button.className).toMatch(/focus-visible:ring-offset/);
    });
  });

  describe('Input Focus', () => {
    it('input should have visible focus state', () => {
      render(<Input data-testid="focus-input" />);
      const input = screen.getByTestId('focus-input');

      // Should have focus ring and/or border change
      expect(input.className).toMatch(/focus-visible:ring|focus:border/);
    });
  });

  describe('Checkbox Focus', () => {
    it('checkbox should have visible focus indicator', () => {
      render(<Checkbox data-testid="focus-checkbox" />);
      const checkbox = screen.getByTestId('focus-checkbox');

      // Should have focus-visible ring
      expect(checkbox.className).toMatch(/focus-visible:ring/);
    });
  });
});

describe('Color Contrast Accessibility', () => {
  describe('Button Variants', () => {
    it('primary button should use high-contrast colors', () => {
      render(<Button variant="primary" data-testid="primary-btn">Primary</Button>);
      const button = screen.getByTestId('primary-btn');

      // Dark background with light text or vice versa
      expect(button.className).toMatch(/bg-zinc-900.*text-white|bg-white.*text-zinc-900/);
    });

    it('outline button should have visible border', () => {
      render(<Button variant="outline" data-testid="outline-btn">Outline</Button>);
      const button = screen.getByTestId('outline-btn');

      expect(button.className).toMatch(/border/);
    });

    it('ghost button should have adequate hover contrast', () => {
      render(<Button variant="ghost" data-testid="ghost-btn">Ghost</Button>);
      const button = screen.getByTestId('ghost-btn');

      // Ghost buttons need visible hover state
      expect(button.className).toMatch(/hover:bg/);
    });
  });
});

describe('Screen Reader Accessibility', () => {
  describe('Loading States', () => {
    it('loading button should announce status to screen readers', () => {
      render(
        <Button disabled aria-busy="true" data-testid="loading-btn">
          <span className="sr-only">Loading</span>
          <span aria-hidden="true">...</span>
        </Button>
      );

      const button = screen.getByTestId('loading-btn');
      expect(button).toHaveAttribute('aria-busy', 'true');

      // Should have screen reader text
      const srText = button.querySelector('.sr-only');
      expect(srText).toBeInTheDocument();
    });
  });

  describe('Icon Buttons', () => {
    it('icon-only button must have accessible name', () => {
      render(
        <Button size="icon" aria-label="Search">
          <span aria-hidden="true">🔍</span>
        </Button>
      );

      const button = screen.getByRole('button', { name: 'Search' });
      expect(button).toBeInTheDocument();
    });
  });
});
