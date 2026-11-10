import { BACKEND_MAX_PAGE_SIZE, isTruncated, truncationHint } from '../pagination';

describe('pagination completeness', () => {
  it('matches the backend page size ceiling', () => {
    expect(BACKEND_MAX_PAGE_SIZE).toBe(100);
  });

  it.each([undefined, null, NaN, Infinity, -Infinity])('does not report unknown totals (%s) as truncated', total => {
    expect(isTruncated(total, 0)).toBe(false);
    expect(truncationHint(total, 0)).toBeNull();
  });

  it.each([[0, 0], [100, 100], [20, 100]])('does not warn when total %s is fully returned in %s rows', (total, returned) => {
    expect(isTruncated(total, returned)).toBe(false);
    expect(truncationHint(total, returned)).toBeNull();
  });

  it('shows an English explanation with actual counts when results are incomplete', () => {
    expect(isTruncated(300, 100)).toBe(true);
    expect(truncationHint(300, 100)).toBe('Show only the front 100 Articles (Total 300 ), please use search to narrow the range');
  });
});
