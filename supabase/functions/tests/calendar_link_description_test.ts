/**
 * What a calendar row is allowed to promise.
 *
 * The Calendar page used to decide the platform with `link.includes('zoom.')`
 * and offer "Record now" for any non-null link. That meant a Webex invite, a
 * booking page or a lookalike host all rendered as a joinable video call, and
 * the button they offered was one `start-recall-recording` would refuse. These
 * assert the three states are actually three.
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { describeMeetingLink } from "../../../src/lib/meetingUrl.ts";

Deno.test("a recognised link names its platform and is joinable", () => {
  const meet = describeMeetingLink("https://meet.google.com/abc-defg-hij");
  assertEquals(meet.platform, "google_meet");
  assertEquals(meet.label, "Google Meet");
  assert(meet.joinable && meet.hasLink);

  const zoom = describeMeetingLink("https://us05web.zoom.us/j/88551178650?pwd=x.1");
  assertEquals(zoom.platform, "zoom");
  assertEquals(zoom.label, "Zoom");
  assert(zoom.joinable);

  const teams = describeMeetingLink("https://teams.microsoft.com/l/meetup-join/19%3ax/0");
  assertEquals(teams.platform, "teams");
  // 'Microsoft Teams' does not fit the row's second line; the mark carries the brand.
  assertEquals(teams.label, "Teams");
  assert(teams.joinable);
});

Deno.test("no link is an in-person meeting, not a broken one", () => {
  const none = describeMeetingLink(null);
  assertEquals(none.platform, null);
  assertEquals(none.label, "In person");
  assertEquals(none.hasLink, false);
  assertEquals(none.joinable, false);
});

Deno.test("a link we cannot join is its own state, never joinable", () => {
  for (
    const raw of [
      "https://webex.com/meet/x",
      "https://msgsndr.com/widget/booking/abc",
      "https://evilzoom.us/j/1",
      "https://meet.google.com.evil.example/abc",
    ]
  ) {
    const d = describeMeetingLink(raw);
    assertEquals(d.joinable, false, `${raw} must not be joinable`);
    assertEquals(d.hasLink, true, `${raw} is still a link`);
    assertEquals(d.platform, null);
    assertEquals(d.label, "Video link");
  }
});
