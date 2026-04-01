import type { Page } from 'playwright';
import { BaseMeetAdapter } from './base';
import { logger } from '../utils/logger';

export class TeamsAdapter extends BaseMeetAdapter {
  validateUrl(url: string): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return (
        hostname === 'teams.microsoft.com' ||
        hostname.endsWith('.teams.microsoft.com') ||
        hostname === 'teams.live.com'
      );
    } catch {
      return false;
    }
  }

  async join(page: Page, url: string, displayName: string): Promise<void> {
    logger.info('[Teams] Navigating to meeting', { url });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // Handle "Continue on this browser" prompt
    await this._continueBrowser(page);

    // Enter display name on the pre-join screen
    await this._enterName(page, displayName);

    // Turn off mic and camera
    await this._dismissAVControls(page);

    // Join the meeting
    await this._clickJoin(page);

    // Wait in lobby if needed
    await this._waitForLobbyOrMeeting(page);

    logger.info('[Teams] Successfully joined / waiting in lobby');
  }

  async detectMeetingEnd(page: Page): Promise<boolean> {
    try {
      const endedSels = [
        'text="The meeting has ended"',
        'text="You\'ve left the meeting"',
        '[data-tid="meeting-ended-banner"]',
      ];
      for (const sel of endedSels) {
        const el = await page.$(sel);
        if (el) return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async leave(page: Page): Promise<void> {
    try {
      logger.info('[Teams] Leaving meeting');
      const leaveSels = [
        '[data-tid="hangup-main-btn"]',
        '[aria-label="Leave"]',
        'button[title="Leave"]',
      ];
      for (const sel of leaveSels) {
        if (await this.safeClick(page, sel, 5_000)) {
          // Confirm leave if dialog appears
          await this.safeClick(page, 'text="Leave"', 3_000);
          return;
        }
      }
      await page.goto('about:blank');
    } catch (err) {
      logger.warn('[Teams] Could not leave gracefully', { err });
      await page.goto('about:blank').catch(() => undefined);
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async _continueBrowser(page: Page): Promise<void> {
    const continueSels = [
      'text="Continue on this browser"',
      'text="Use the web app instead"',
      '[data-tid="joinOnWeb"]',
    ];
    for (const sel of continueSels) {
      if (await this.safeClick(page, sel, 10_000)) {
        logger.debug('[Teams] Clicked "Continue on this browser"');
        return;
      }
    }
  }

  private async _enterName(page: Page, displayName: string): Promise<void> {
    const nameSels = [
      'input[placeholder="Enter your name"]',
      'input[data-tid="prejoin-input-name"]',
      '[aria-label="Enter your name"]',
    ];
    const found = await this.waitForAny(page, nameSels, 20_000);
    if (found) {
      await page.fill(found, displayName);
      logger.debug('[Teams] Entered display name');
    } else {
      logger.warn('[Teams] Name input not found');
    }
  }

  private async _dismissAVControls(page: Page): Promise<void> {
    // Turn off camera
    const camSels = [
      '[data-tid="toggle-video"]',
      '[aria-label="Turn camera off"]',
      'button[title*="camera"]',
    ];
    for (const sel of camSels) {
      if (await this.safeClick(page, sel, 3_000)) {
        logger.debug('[Teams] Turned off camera');
        break;
      }
    }

    // Turn off mic
    const micSels = [
      '[data-tid="toggle-mute"]',
      '[aria-label="Mute microphone"]',
      'button[title*="microphone"]',
    ];
    for (const sel of micSels) {
      if (await this.safeClick(page, sel, 3_000)) {
        logger.debug('[Teams] Muted microphone');
        break;
      }
    }
  }

  private async _clickJoin(page: Page): Promise<void> {
    const joinSels = [
      '[data-tid="prejoin-join-button"]',
      'text="Join now"',
      'text="Join"',
      '[aria-label="Join now"]',
    ];
    const found = await this.waitForAny(page, joinSels, 30_000);
    if (found) {
      await this.safeClick(page, found);
      logger.info('[Teams] Clicked join button');
    } else {
      throw new Error('Could not find join button on Teams');
    }
  }

  private async _waitForLobbyOrMeeting(page: Page): Promise<void> {
    const activeSels = [
      'text="Waiting to be let in"', // lobby
      '[data-tid="hangup-main-btn"]', // in meeting
      '[data-tid="roster-button"]', // participants panel button
    ];
    const found = await this.waitForAny(page, activeSels, 60_000);
    if (found) {
      logger.info('[Teams] In meeting or lobby', { indicator: found });
    } else {
      logger.warn('[Teams] Could not confirm meeting state');
    }
  }
}
