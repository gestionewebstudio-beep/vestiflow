import { describe, expect, it } from 'vitest';

import { TikTokConnectionStatus } from '@core/models/tiktok-connection.model';

import {
  tiktokConnectionStatusLabel,
  tiktokConnectionStatusTone,
} from './tiktok-connection-labels.util';

describe('tiktok-connection-labels.util', () => {
  for (const status of Object.values(TikTokConnectionStatus)) {
    it(`copre TikTokConnectionStatus.${status}`, () => {
      expect(tiktokConnectionStatusLabel(status)).toBeTruthy();
      expect(tiktokConnectionStatusTone(status)).toBeTruthy();
    });
  }
});
