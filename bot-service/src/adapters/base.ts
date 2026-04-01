import type { Page } from 'playwright';

/**
 * MeetAdapter — contract every platform adapter must satisfy.
 */
export interface MeetAdapter {
  /**
   * Return true if the given URL belongs to this platform.
   */
  validateUrl(url: string): boolean;

  /**
   * Navigate to the meeting, handle name prompt, dismiss AV permissions,
   * click join / "Ask to join", and wait until the meeting is active.
   */
  join(page: Page, url: string, displayName: string): Promise<void>;

  /**
   * Poll the page for end-of-meeting signals.
   * Should resolve to `true` once the meeting has ended.
   */
  detectMeetingEnd(page: Page): Promise<boolean>;

  /**
   * Gracefully leave the meeting (click the leave button or navigate away).
   */
  leave(page: Page): Promise<void>;
}

/**
 * Base helper used by all concrete adapters.
 */
export abstract class BaseMeetAdapter implements MeetAdapter {
  abstract validateUrl(url: string): boolean;
  abstract join(page: Page, url: string, displayName: string): Promise<void>;
  abstract detectMeetingEnd(page: Page): Promise<boolean>;
  abstract leave(page: Page): Promise<void>;

  /** Wait up to `timeout` ms for any of the given selectors to appear. */
  protected async waitForAny(
    page: Page,
    selectors: string[],
    timeout = 30_000,
  ): Promise<string | null> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      for (const sel of selectors) {
        try {
          const el = await page.$(sel);
          if (el) return sel;
        } catch {
          /* keep trying */
        }
      }
      await page.waitForTimeout(500);
    }
    return null;
  }

  /** Safe click — waits for element and clicks, swallows errors. */
  protected async safeClick(page: Page, selector: string, timeout = 10_000): Promise<boolean> {
    try {
      await page.waitForSelector(selector, { timeout });
      await page.click(selector);
      return true;
    } catch {
      return false;
    }
  }
}
