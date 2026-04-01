import type { Page } from 'playwright';
import { BaseMeetAdapter } from './base';
import { logger } from '../utils/logger';

const CONSENT_MESSAGE = 'This meeting is being recorded by EchoBrief for transcription and notes.';

export class GoogleMeetAdapter extends BaseMeetAdapter {
  validateUrl(url: string): boolean {
    try {
      return new URL(url).hostname === 'meet.google.com';
    } catch {
      return false;
    }
  }

  async join(page: Page, url: string, displayName: string): Promise<void> {
    logger.info('[GoogleMeet] Navigating to meeting', { url });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // Dismiss browser permission prompts (mic/camera) — grant nothing
    await page.context().grantPermissions([]);

    // Handle "Continue without signing in" / name input
    await this._handleNameInput(page, displayName);

    // Turn off camera & microphone toggles if present
    await this._dismissAVControls(page);

    // Click "Ask to join" or "Join now"
    await this._clickJoin(page);

    // Wait for actual meeting room to load
    await this._waitForMeetingRoom(page);

    // Post consent message in chat
    await this._postConsentMessage(page);

    logger.info('[GoogleMeet] Successfully joined meeting');
  }

  async detectMeetingEnd(page: Page): Promise<boolean> {
    try {
      // Check for "You've been removed from the meeting"
      const removed = await page.$('text="You\'ve been removed"');
      if (removed) return true;

      // Check for "This call has ended" dialog
      const ended = await page.$('text="This call has ended"');
      if (ended) return true;

      // Check for "Return to home screen" button (post-call)
      const returnHome = await page.$('[data-mdc-dialog-action="ok"]');
      if (returnHome) return true;

      // Check participant count — if only the bot remains
      const participantElements = await page.$$('[data-requested-participant-id]');
      if (participantElements.length === 0) {
        // Double-check: wait 5s and check again
        await page.waitForTimeout(5_000);
        const recheck = await page.$$('[data-requested-participant-id]');
        if (recheck.length === 0) return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  async leave(page: Page): Promise<void> {
    try {
      logger.info('[GoogleMeet] Leaving meeting');
      // Click the leave call button
      const leaveBtn = await page.$('[aria-label="Leave call"]');
      if (leaveBtn) {
        await leaveBtn.click();
        await page.waitForTimeout(2_000);
      } else {
        await page.goto('about:blank');
      }
    } catch (err) {
      logger.warn('[GoogleMeet] Could not leave gracefully, navigating away', { err });
      await page.goto('about:blank').catch(() => undefined);
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async _handleNameInput(page: Page, displayName: string): Promise<void> {
    // Wait for either the name input or the pre-join screen
    const nameSelectors = [
      'input[placeholder="Your name"]',
      'input[aria-label="Your name"]',
      '[data-testid="prejoin-display-name-input"]',
    ];

    const found = await this.waitForAny(page, nameSelectors, 20_000);
    if (found) {
      logger.debug('[GoogleMeet] Name input found, typing display name');
      await page.fill(found, displayName);
    } else {
      logger.warn('[GoogleMeet] Name input not found — might already be signed in');
    }
  }

  private async _dismissAVControls(page: Page): Promise<void> {
    // Attempt to turn off mic
    const micSelectors = [
      '[aria-label="Turn off microphone"]',
      '[data-is-muted="false"][aria-label*="microphone"]',
    ];
    for (const sel of micSelectors) {
      if (await this.safeClick(page, sel, 3_000)) {
        logger.debug('[GoogleMeet] Turned off microphone');
        break;
      }
    }

    // Attempt to turn off camera
    const camSelectors = [
      '[aria-label="Turn off camera"]',
      '[data-is-muted="false"][aria-label*="camera"]',
    ];
    for (const sel of camSelectors) {
      if (await this.safeClick(page, sel, 3_000)) {
        logger.debug('[GoogleMeet] Turned off camera');
        break;
      }
    }
  }

  private async _clickJoin(page: Page): Promise<void> {
    const joinSelectors = [
      '[data-idom-class="nUpTuG"][jsname="Qx7uuf"]', // "Ask to join"
      'button[jsname="Qx7uuf"]',
      '[aria-label="Ask to join"]',
      '[aria-label="Join now"]',
      'text="Ask to join"',
      'text="Join now"',
    ];

    const found = await this.waitForAny(page, joinSelectors, 30_000);
    if (found) {
      await this.safeClick(page, found);
      logger.info('[GoogleMeet] Clicked join button', { selector: found });
    } else {
      throw new Error('Could not find join button on Google Meet');
    }
  }

  private async _waitForMeetingRoom(page: Page): Promise<void> {
    // Wait for the in-meeting UI to appear
    const inMeetingSelectors = [
      '[aria-label="Leave call"]',
      '[data-call-ended="false"]',
      '[jsname="r4nke"]', // meeting grid
    ];
    const found = await this.waitForAny(page, inMeetingSelectors, 60_000);
    if (!found) {
      logger.warn('[GoogleMeet] Could not confirm meeting room loaded — continuing anyway');
    }
  }

  private async _postConsentMessage(page: Page): Promise<void> {
    try {
      // Open chat panel
      const chatBtnSelectors = [
        '[aria-label="Chat with everyone"]',
        '[data-tooltip="Chat with everyone"]',
        'button[jsname="A5il2e"]',
      ];
      const chatBtn = await this.waitForAny(page, chatBtnSelectors, 10_000);
      if (!chatBtn) {
        logger.warn('[GoogleMeet] Chat button not found — skipping consent message');
        return;
      }
      await this.safeClick(page, chatBtn, 5_000);

      // Type and send message
      const inputSel = '[aria-label="Send a message to everyone"]';
      await page.waitForSelector(inputSel, { timeout: 10_000 });
      await page.fill(inputSel, CONSENT_MESSAGE);
      await page.keyboard.press('Enter');
      logger.info('[GoogleMeet] Consent message posted in chat');
    } catch (err) {
      logger.warn('[GoogleMeet] Failed to post consent message', { err });
    }
  }
}
