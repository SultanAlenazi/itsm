import { translations } from '../translations';

describe('English application translations', () => {
  it('exports English as the only supported dictionary', () => {
    expect(Object.keys(translations)).toEqual(['en-US']);
  });

  it('provides English navigation and critical action labels', () => {
    expect(translations['en-US'].header).toMatchObject({ profile: 'Profile', settings: 'Settings', logout: 'Logout', notificationCenter: 'Notification Center' });
    expect(translations['en-US'].common).toMatchObject({ save: 'Save', cancel: 'Cancel', confirm: 'Confirm', delete: 'Delete', confirmDeleteContent: 'Are you sure you want to delete? This action cannot be undone.' });
  });

  it('preserves interpolation variables for notification messages', () => {
    expect(translations['en-US'].header.slaWarningContent).toBe('Ticket {ticketId} is about to breach SLA');
    expect(translations['en-US'].notificationDrawer.unreadCount).toBe('{count} unread');
  });

  it('contains nonempty strings without Chinese display text throughout the dictionary', () => {
    const check = (value: unknown): void => {
      if (typeof value === 'string') {
        expect(value.trim()).not.toBe('');
        expect(value).not.toMatch(/[\u3400-\u9fff]/);
      } else {
        expect(value).toBeDefined();
        for (const child of Object.values(value as Record<string, unknown>)) check(child);
      }
    };
    check(translations['en-US']);
  });
});
