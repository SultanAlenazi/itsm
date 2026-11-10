import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { PriorityBadge, StatusBadge, ThemeProvider, ThemeToggle, useTheme } from '../components';

describe('theme components', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('renders every status and priority using English default labels', () => {
    render(<ThemeProvider defaultMode="light">
      <StatusBadge status="new" /><StatusBadge status="open" /><StatusBadge status="inProgress" />
      <StatusBadge status="pending" /><StatusBadge status="resolved" /><StatusBadge status="closed" />
      <StatusBadge status="cancelled" />
      <PriorityBadge priority="low" /><PriorityBadge priority="normal" /><PriorityBadge priority="high" />
      <PriorityBadge priority="urgent" /><PriorityBadge priority="critical" />
    </ThemeProvider>);
    for (const label of ['Create', 'Open', 'In Progress', 'Pending', 'Resolved', 'Closed', 'Cancelled', 'Low', 'Normal', 'High', 'Urgent', 'Critical']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('allows explicit badge content instead of the default label', () => {
    render(<ThemeProvider defaultMode="light"><StatusBadge status="open">Awaiting owner</StatusBadge><PriorityBadge priority="high">P1 escalation</PriorityBadge></ThemeProvider>);
    expect(screen.getByText('Awaiting owner')).toBeInTheDocument();
    expect(screen.getByText('P1 escalation')).toBeInTheDocument();
    expect(screen.queryByText('Open')).not.toBeInTheDocument();
  });

  it('exposes English theme controls and persists explicit selections', () => {
    render(<ThemeProvider defaultMode="light"><ThemeToggle /></ThemeProvider>);
    expect(screen.getByTitle('Follow the system')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Dark theme'));
    expect(localStorage.getItem('itsm-theme-mode')).toBe('dark');
    expect(document.documentElement).toHaveClass('dark');
    fireEvent.click(screen.getByTitle('Light theme'));
    expect(localStorage.getItem('itsm-theme-mode')).toBe('light');
    expect(document.documentElement).not.toHaveClass('dark');
    expect(document.documentElement.style.getPropertyValue('--color-background')).toBe('#ffffff');
  });

  it('restores saved mode using a custom storage key', () => {
    localStorage.setItem('operator-theme', 'dark');
    const CurrentMode = () => <output>{useTheme().mode}</output>;
    render(<ThemeProvider defaultMode="light" storageKey="operator-theme"><CurrentMode /></ThemeProvider>);
    expect(screen.getByText('dark')).toBeInTheDocument();
    expect(document.documentElement).toHaveClass('dark');
  });
});
