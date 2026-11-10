import { colors, darkColors, colorUsage, contrastChecker, themeConfig } from '../colors';

describe('design system colors', () => {
  it('decodes full RGB hex colors and rejects malformed values', () => {
    expect(contrastChecker.hexToRgb('#12AbEF')).toEqual({ r: 18, g: 171, b: 239 });
    expect(contrastChecker.hexToRgb('000000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(contrastChecker.hexToRgb('#fff')).toBeNull();
    expect(contrastChecker.hexToRgb('invalid')).toBeNull();
  });

  it('calculates symmetric WCAG contrast and distinguishes inaccessible text', () => {
    expect(contrastChecker.getContrastRatio('#000000', '#ffffff')).toBeCloseTo(21);
    expect(contrastChecker.getContrastRatio('#ffffff', '#000000')).toBeCloseTo(21);
    expect(contrastChecker.checkWCAGCompliance('#000000', '#ffffff')).toEqual({ AA: true, AAA: true, ratio: 21 });
    expect(contrastChecker.checkWCAGCompliance('#ffffff', '#ffffff')).toEqual({ AA: false, AAA: false, ratio: 1 });
    expect(contrastChecker.checkWCAGCompliance('#777777', '#000000')).toMatchObject({ AA: true, AAA: false });
  });

  it('binds theme descriptions to the correct palettes and keeps usage guidance English', () => {
    expect(themeConfig.light.colors).toBe(colors);
    expect(themeConfig.dark.colors).toBe(darkColors);
    expect(themeConfig.light.description).toBe('Light theme, suitable for daytime use');
    expect(themeConfig.dark.description).toBe('Dark theme, suitable for night use');
    expect(colorUsage.semantic.error.usage).toContain('Delete button');
    expect(colorUsage.primary.usage).toContain('Main button');
    expect(JSON.stringify(colorUsage)).not.toMatch(/[\u3400-\u9fff]/);
  });

  it('returns calculated ratios for the recommended text/background combinations', () => {
    const recommendations = contrastChecker.getRecommendedCombinations();
    expect(recommendations).toHaveLength(6);
    expect(recommendations[0]).toMatchObject({ background: colors.functional.background.primary, text: colors.functional.text.primary, compliance: 'AAA' });
    for (const combination of recommendations) {
      expect(combination.ratio).toBe(contrastChecker.getContrastRatio(combination.background, combination.text));
    }
  });
});
