import { describe, expect, it } from 'vitest';

import { clampPan, computeCoverScale, effectiveScale } from './avatar-crop.util';

describe('avatar-crop.util', () => {
  describe('computeCoverScale', () => {
    it('usa il rapporto maggiore per coprire il viewport', () => {
      expect(computeCoverScale(200, 100, 100)).toBe(1);
      expect(computeCoverScale(100, 200, 100)).toBe(1);
      expect(computeCoverScale(400, 400, 100)).toBe(0.25);
    });
  });

  describe('effectiveScale', () => {
    it('applica zoom clampato al cover scale', () => {
      expect(effectiveScale(1, 2)).toBe(2);
      expect(effectiveScale(1, 0)).toBeGreaterThan(0);
    });
  });

  describe('clampPan', () => {
    it('limita pan entro i bordi dell immagine scalata', () => {
      const { panX, panY } = clampPan(999, -999, 100, 100, 2, 100);
      expect(panX).toBeLessThan(999);
      expect(panY).toBeGreaterThan(-999);
    });

    it('consente pan zero per immagini piccole', () => {
      expect(clampPan(0, 0, 50, 50, 1, 100)).toEqual({ panX: 0, panY: 0 });
    });
  });
});
