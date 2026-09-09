/**
 * The provider-neutral calendar layer.
 *
 * Everything here is pure: link extraction, the join decision, and the two
 * event normalisers. The join decision in particular is load-bearing — before
 * it existed the bot fired on any event with a video link, which produced most
 * of the "no audio captured" results — so both providers must reach the same
 * answer from very different payloads.
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  extractMeetingLink,
  shouldJoin,
  type NormalizedEvent,
} from "../_shared/calendar-connections.ts";

function ev(over: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    provider: "google",
    providerEventId: "e1",
    calendarId: "primary",
    title: "Standup",
    description: null,
    startTime: "2026-09-02T10:00:00Z",
    endTime: "2026-09-02T10:30:00Z",
    location: null,
    meetingLink: null,
    organizerName: null,
    organizerEmail: null,
    attendees: [],
    responseStatus: "none",
    isOwner: false,
    cancelled: false,
    version: null,
    raw: {},
    ...over,
  };
}

Deno.test("extractMeetingLink takes a bare structured URL", () => {
  assertEquals(
    extractMeetingLink(["https://meet.google.com/abc-defg-hij"]),
    "https://meet.google.com/abc-defg-hij",
  );
  assertEquals(
    extractMeetingLink([null, undefined, "https://us02web.zoom.us/j/123"]),
    "https://us02web.zoom.us/j/123",
  );
});

Deno.test("extractMeetingLink digs a link out of description text", () => {
  const body = "Agenda attached.\nJoin: https://teams.microsoft.com/l/meetup-join/19%3axyz\nThanks";
  assertEquals(
    extractMeetingLink([null, body]),
    "https://teams.microsoft.com/l/meetup-join/19%3axyz",
  );
});

Deno.test("extractMeetingLink strips trailing punctuation and HTML delimiters", () => {
  assertEquals(
    extractMeetingLink(["Dial in at https://zoom.us/j/999999."]),
    "https://zoom.us/j/999999",
  );
  assertEquals(
    extractMeetingLink(['<a href="https://meet.google.com/xyz-abcd-efg">join</a>']),
    "https://meet.google.com/xyz-abcd-efg",
  );
});

Deno.test("extractMeetingLink refuses a lookalike host", () => {
  // The old regex matched a bare `zoom.us` substring, so evilzoom.us passed and
  // was handed straight to Recall.
  assertEquals(extractMeetingLink(["https://evilzoom.us/j/1"]), null);
  assertEquals(extractMeetingLink(["https://meet.google.com.evil.example/x"]), null);
  assertEquals(extractMeetingLink(["https://calendly.com/somebody"]), null);
  assertEquals(extractMeetingLink([null, undefined, ""]), null);
});

Deno.test("extractMeetingLink prefers the first usable candidate", () => {
  // Structured conference data beats whatever is pasted in the description.
  assertEquals(
    extractMeetingLink([
      "https://meet.google.com/real-link",
      "https://zoom.us/j/from-description",
    ]),
    "https://meet.google.com/real-link",
  );
});

Deno.test("shouldJoin: accepted invitations are joined", () => {
  assert(shouldJoin(ev({ responseStatus: "accepted" })));
  assert(shouldJoin(ev({ responseStatus: "accepted", isOwner: true })));
});

Deno.test("shouldJoin: the owner joins unless they declined", () => {
  assert(shouldJoin(ev({ isOwner: true, responseStatus: "none" })));
  assert(shouldJoin(ev({ isOwner: true, responseStatus: "tentative" })));
  assert(!shouldJoin(ev({ isOwner: true, responseStatus: "declined" })));
});

Deno.test("shouldJoin: an unanswered or declined invitation is left alone", () => {
  // This is the filter that stopped the bot firing on dead recurring series.
  assert(!shouldJoin(ev({ responseStatus: "none" })));
  assert(!shouldJoin(ev({ responseStatus: "declined" })));
  assert(!shouldJoin(ev({ responseStatus: "tentative" })));
});

Deno.test("shouldJoin: a cancelled event is never joined", () => {
  assert(!shouldJoin(ev({ responseStatus: "accepted", cancelled: true })));
  assert(!shouldJoin(ev({ isOwner: true, cancelled: true })));
});

// --- normalisation, through the real fetch path with a stubbed transport ----

function withFetch<T>(handler: (url: string, init?: RequestInit) => unknown, run: () => Promise<T>) {
  const original = globalThis.fetch;
  globalThis.fetch = ((url: string, init?: RequestInit) =>
    Promise.resolve(
      new Response(JSON.stringify(handler(String(url), init)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )) as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

const FROM = new Date("2026-09-02T10:00:00Z");
const TO = new Date("2026-09-02T10:08:00Z");

Deno.test("google events normalise, including the join decision", async () => {
  const payload = {
    items: [
      {
        id: "g1",
        summary: "Client call",
        status: "confirmed",
        updated: "2026-09-01T12:00:00Z",
        start: { dateTime: "2026-09-02T10:05:00Z" },
        end: { dateTime: "2026-09-02T10:35:00Z" },
        hangoutLink: "https://meet.google.com/abc-defg-hij",
        organizer: { email: "me@acme.com", displayName: "Me", self: true },
        attendees: [{ email: "me@acme.com", self: true, responseStatus: "accepted" }],
      },
    ],
  };
  await withFetch(() => payload, async () => {
    const { fetchUpcomingEvents } = await import("../_shared/calendar-connections.ts");
    const result = await fetchUpcomingEvents("google", "tok", FROM, TO);
    assert(result.ok);
    const [e] = result.events;
    assertEquals(e.provider, "google");
    assertEquals(e.providerEventId, "g1");
    assertEquals(e.title, "Client call");
    assertEquals(e.meetingLink, "https://meet.google.com/abc-defg-hij");
    assertEquals(e.responseStatus, "accepted");
    assertEquals(e.isOwner, true);
    assertEquals(e.version, "2026-09-01T12:00:00Z");
    assert(shouldJoin(e));
  });
});

Deno.test("microsoft events normalise, and naive UTC times get their Z", async () => {
  // Graph returns "2026-09-02T10:05:00.0000000" with a separate timeZone field.
  // Without the Z that string is read as the server's local time — a bot that
  // joins hours late, or never.
  const payload = {
    value: [
      {
        id: "m1",
        subject: "Vendor sync",
        isCancelled: false,
        isOrganizer: true,
        lastModifiedDateTime: "2026-09-01T09:00:00Z",
        start: { dateTime: "2026-09-02T10:05:00.0000000", timeZone: "UTC" },
        end: { dateTime: "2026-09-02T10:35:00.0000000", timeZone: "UTC" },
        onlineMeeting: { joinUrl: "https://teams.microsoft.com/l/meetup-join/19%3aabc" },
        organizer: { emailAddress: { address: "me@acme.com", name: "Me" } },
        responseStatus: { response: "organizer" },
        attendees: [
          { emailAddress: { address: "them@vendor.com", name: "Them" }, status: { response: "accepted" } },
        ],
      },
    ],
  };
  await withFetch(() => payload, async () => {
    const { fetchUpcomingEvents } = await import("../_shared/calendar-connections.ts");
    const result = await fetchUpcomingEvents("microsoft", "tok", FROM, TO);
    assert(result.ok);
    const [e] = result.events;
    assertEquals(e.provider, "microsoft");
    assertEquals(e.title, "Vendor sync");
    assertEquals(e.meetingLink, "https://teams.microsoft.com/l/meetup-join/19%3aabc");
    // The Z is the whole point.
    assertEquals(e.startTime.endsWith("Z"), true);
    assertEquals(Date.parse(e.startTime), Date.parse("2026-09-02T10:05:00Z"));
    assertEquals(e.responseStatus, "accepted"); // 'organizer' counts as accepted
    assertEquals(e.isOwner, true);
    // Attendees are reshaped to the Google shape the rest of the pipeline reads.
    assertEquals(e.attendees, [
      { email: "them@vendor.com", displayName: "Them", responseStatus: "accepted" },
    ]);
    assert(shouldJoin(e));
  });
});

Deno.test("a declined Teams invitation is not joined", async () => {
  const payload = {
    value: [{
      id: "m2", subject: "Optional", isOrganizer: false,
      start: { dateTime: "2026-09-02T10:05:00.0000000", timeZone: "UTC" },
      end: { dateTime: "2026-09-02T10:35:00.0000000", timeZone: "UTC" },
      onlineMeeting: { joinUrl: "https://teams.microsoft.com/l/meetup-join/19%3axyz" },
      responseStatus: { response: "declined" },
    }],
  };
  await withFetch(() => payload, async () => {
    const { fetchUpcomingEvents } = await import("../_shared/calendar-connections.ts");
    const result = await fetchUpcomingEvents("microsoft", "tok", FROM, TO);
    assert(result.ok);
    assertEquals(shouldJoin(result.events[0]), false);
  });
});

Deno.test("an event with no joinable link yields no meetingLink", async () => {
  const payload = {
    items: [{
      id: "g2", summary: "Desk work", status: "confirmed",
      start: { dateTime: "2026-09-02T10:05:00Z" }, end: { dateTime: "2026-09-02T10:35:00Z" },
      location: "Room 3", description: "See https://calendly.com/x",
    }],
  };
  await withFetch(() => payload, async () => {
    const { fetchUpcomingEvents } = await import("../_shared/calendar-connections.ts");
    const result = await fetchUpcomingEvents("google", "tok", FROM, TO);
    assert(result.ok);
    assertEquals(result.events[0].meetingLink, null);
  });
});

Deno.test("a provider error is reported, not thrown", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response("nope", { status: 401 }))) as typeof fetch;
  try {
    const { fetchUpcomingEvents } = await import("../_shared/calendar-connections.ts");
    const result = await fetchUpcomingEvents("google", "tok", FROM, TO);
    assertEquals(result.ok, false);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("extractMeetingLink finds a Zoom tenant link in the location field", () => {
  // The real event that shipped as "In person": sync-google-calendar had a
  // regex requiring zoom.us straight after the scheme, so us05web.zoom.us in
  // `location` matched nothing and the card had no link to show.
  const url = "https://us05web.zoom.us/j/88551178650?pwd=byjGPryJ5aFzUaBiIAW0WhIGvnvcW6.1";
  assertEquals(extractMeetingLink([undefined, undefined, url, null]), url);
});

Deno.test("extractMeetingLink reads a Zoom link out of an HTML anchor description", () => {
  const url = "https://us05web.zoom.us/j/88551178650?pwd=byjGPryJ5aFzUaBiIAW0WhIGvnvcW6.1";
  const description = `<a href="${url}" target="_blank">https://us05web.zoom.us/j/<wbr />88551178650</a><br>`;
  assertEquals(extractMeetingLink([null, null, null, description]), url);
});
