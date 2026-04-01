import type { Page } from 'playwright';
import { BaseMeetAdapter } from './base';
import { logger } from '../utils/logger';

export class ZoomAdapter extends BaseMeetAdapter {
  validateUrl(url: string): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return hostname === 'zoom.us' || hostname.endsWith('.zoom.us');
    } catch {
      return false;
    }
  }

  async join(page: Page, url: string, displayName: string): Promise<void> {
    // Force web client by appending ?type=1 (or ?pwd=... with type=1)
    const webUrl = this._forceWebClient(url);
    logger.info('[Zoom] Navigating to web client', { url: webUrl });

    await page.goto(webUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // Handle "Open Zoom" prompt — dismiss it
    await this._dismissAppPrompt(page);

    // Enter display name
    await this._enterName(page, displayName);

    // Click "Join" button
    await this._clickJoin(page);

    // Handle audio join dialog (click "Join Audio by Computer" or dismiss)
    await this._dismissAudioDialog(page);

    // Wait for meeting to be active
    await this._waitForMeetingRoom(page);

    logger.info('[Zoom] Successfully joined meeting');
  }

  async detectMeetingEnd(page: Page): Promise<boolean> {
    try {
      const endedTexts = [
        'text="This meeting has been ended by the host"',
        'text="Meeting ended"',
        'text="The meeting has been ended"',
      ];
      for (const sel of endedTexts) {
        const el = await page.$(sel);
        if (el) return true;
      }

      // Check if redirected away from meeting
      const currentUrl = page.url();
      if (currentUrl.includes('/wc/') === false && currentUrl.includes('zoom.us')) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  async leave(page: Page): Promise<void> {
    try {
      logger.info('[Zoom] Leaving meeting');
      // Click "Leave" button
      const leaveSel = '[aria-label="leave meeting"]';
      if (await this.safeClick(page, leaveSel, 5_000)) {
        // Confirm leave (not end)
        await this.safeClick(page, 'text="Leave Meeting"', 5_000);
      } else {
        await page.goto('about:blank');
      }
    } catch (err) {
      logger.warn('[Zoom] Could not leave gracefully', { err });
      await page.goto('about:blank').catch(() => undefined);
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private _forceWebClient(url: string): string {
    try {
      const parsed = new URL(url);
      // Convert /j/MEETINGID to /wc/MEETINGID/join
      const pathMatch = parsed.pathname.match(/\/j\/(\d+)/);
      if (pathMatch) {
        const meetingId = pathMatch[1];
        const pwd = parsed.searchParams.get('pwd');
        const webPath = `/wc/${meetingId}/join`;
        parsed.pathname = webPath;
        parsed.searchParams.set('prefer_webgl', '1');
        if (pwd) parsed.searchParams.set('pwd', pwd);
        return parsed.toString();
      }
      // Already a web client URL or unknown — add type=1
      parsed.searchParams.set('type', '1');
      return parsed.toString();
    } catch {
      return url;
    }
  }

  private async _dismissAppPrompt(page: Page): Promise<void> {
    // "Cancel" on the "Open Zoom Meetings" browser dialog
    const cancelSels = [
      'text="Cancel"',
      '[data-testid="modal-btn-cancel"]',
      'text="join from Your Browser"',
      'a[class*="joinFromBrowser"]',
    ];
    for (const sel of cancelSels) {
      if (await this.safeClick(page, sel, 5_000)) {
        logger.debug('[Zoom] Dismissed app launch prompt');
        break;
      }
    }
  }

  private async _enterName(page: Page, displayName: string): Promise<void> {
    const nameSels = [
      'input#inputname',
      'input[placeholder="Your Name"]',
      'input[placeholder="Your name"]',
      '[data-testid="name-input"]',
    ];
    const found = await this.waitForAny(page, nameSels, 20_000);
    if (found) {
      await page.fill(found, '');
      await page.fill(found, displayName);
      logger.debug('[Zoom] Entered display name');
    } else {
      logger.warn('[Zoom] Name input not found');
    }
  }

  private async _clickJoin(page: Page): Promise<void> {
    const joinSels = [
      'button#joinBtn',
      '[data-testid="joinBtn"]',
      'text="Join"',
      'button[class*="join"]',
    ];
    const found = await this.waitForAny(page, joinSels, 15_000);
    if (found) {
      await this.safeClick(page, found);
      logger.info('[Zoom] Clicked join button');
    } else {
      throw new Error('Could not find join button on Zoom');
    }
  }

  private async _dismissAudioDialog(page: Page): Promise<void> {
    const audioSels = [
      'text="Join Audio by Computer"',
      'text="Join Audio"',
      '[aria-label="Join Audio by Computer"]',
    ];
    for (const sel of audioSels) {
      if (await this.safeClick(page, sel, 8_000)) {
        logger.debug('[Zoom] Dismissed audio join dialog');
        return;
      }
    }
  }

  private async _waitForMeetingRoom(page: Page): Promise<void> {
    const activeSels = [
      '[aria-label="leave meeting"]',
      '[data-testid="leave-btn"]',
      '.meeting-app',
    ];
    const found = await this.waitForAny(page, activeSels, 60_000);
    if (!found) {
      logger.warn('[Zoom] Could not confirm meeting room loaded — continuing anyway');
    }
  }
}
