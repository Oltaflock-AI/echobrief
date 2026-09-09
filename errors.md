# Known Errors Runbook

This is the canonical list of error patterns the pipeline can hit, with root cause and recovery steps. The `monitor-stuck-meetings` cron carries a copy of these signatures in code; when it sees a *new* signature, it emails the address in `ALERT_EMAIL_TO` (default `admin@oltaflock.ai`) so we can investigate and add it here.

**Source of truth:** this file. **Audit log:** `monitor_events` table in the DB. The cron's known-pattern list in [`supabase/functions/monitor-stuck-meetings/known-patterns.ts`](supabase/functions/monitor-stuck-meetings/known-patterns.ts) must stay in sync with this file.

---

## Sarvam errors

### `sarvam:keyerror_timestamps`
**What it looks like:** Sarvam job reports `job_state: Completed` at top level, but `successful_files_count: 0`, `failed_files_count: 1`, and `job_details[0].exception_name: "KeyError"` with `error_message: "'timestamps'"`.

**Root cause:** Sarvam server-side bug in their saaras:v3 model when audio is longer than ~7 minutes. Reproduced across 4 different config combinations (translate/transcribe modes, en-IN/unknown languages, with timestamps on/off). Cannot be dodged with config flags. Reported to Sarvam Discord 2026-04-25. **Confirmed still live 2026-06-09** via controlled replay: the same 47-min file fails at full length but transcribes perfectly as 5–6-min chunks; an 8 MB/47-min file fails while a 6.8 MB/6-min file succeeds → trigger is **duration, not file size or config**.

**Fix shipped 2026-06-10 (chunking):** `recall-pipeline` now routes audio through the Vercel `api/split-audio` function, which ffmpeg-splits long audio into 300 s re-encoded chunks (stream-copy chunks are rejected by Sarvam with "Audio contains no samples"), submits all chunks as ONE multi-file Sarvam job, and `sarvam-webhook` stitches the per-chunk outputs (offsetting timestamps by `chunk_index × chunk_seconds`). Validated end-to-end: the failing 47-min meeting produced 21k chars across 10/10 chunks.

**Recovery (if chunked path unavailable):** legacy fall-back chain still applies — direct single-file Sarvam submission, then Whisper via `process-meeting` with `forceWhisper: true`.

**Open issue:** Whisper fallback OOMs/oversizes for long audio (see `whisper:oom`, `whisper:audio_too_large`) — but it is now only reached when both the chunked and direct Sarvam paths fail.

---

### `sarvam:silent_empty_output`
**What it looks like:** Sarvam job reports `successful_files_count: 1, state: Success`, but the downloaded output JSON is fully empty: `transcript: ""` (or a single space), `diarized_transcript: null`, `language_code: null`. **No exception is raised** — this is a silent failure.

**Root cause (confirmed 2026-08-29, and this is the big one):** the **Content-Type of the blob we PUT to Sarvam's presigned upload URL**. Sarvam's batch pipeline decodes the uploaded file by its stored content type. Uploaded as `application/octet-stream` — which both `_shared/sarvam.ts` and `api/split-audio.ts` did — the job reports `state: Success`, `successful_files_count: 1`, and returns `transcript: ""`, `language_code: null`. Uploaded as `audio/mpeg`, the identical bytes transcribe correctly.

Proven by submitting one file twice, changing nothing but that header:

| Upload Content-Type | Job state | Output |
|---|---|---|
| `application/octet-stream` | `Completed` / `Success` | **0 chars**, `language_code: null` |
| `audio/mpeg` | `Completed` / `Success` | 2,908 chars of English (6.5 min Hindi fixture) |

Independent of length: a clean **7-second** English clip was also empty under octet-stream. Independent of mode: `transcribe` and `translate` both empty. Independent of chunking: whole-file and 2-chunk submissions both empty. **The sync `/speech-to-text` endpoint is unaffected** — same API key, correct transcript — which is exactly why the key and the account looked healthy while every batch job silently produced nothing.

The earlier duration-triggered theory above still explains the 2026-06 chunking fix; it does not explain this, and this one hits every file regardless of size.

**Recovery:** FIXED at the source — both uploaders now send a real audio content type (`contentTypeFor()` in `_shared/sarvam.ts`, `audio/mpeg` in `api/split-audio.ts`), covered by unit tests so it cannot regress silently. Chunking (2026-06-10) remains the defence for the duration bug. If a job still returns empty, the `!finalTranscript` branch in `sarvam-webhook` falls back to chunk-wise Whisper — which is what masked this for as long as it lasted: meetings still completed, just on the wrong provider.

---

## Whisper errors

### `whisper:oom`
**What it looks like:** Edge function invocation of `process-meeting` with `forceWhisper: true` returns `{"code":"WORKER_RESOURCE_LIMIT","message":"Function failed due to not having enough compute resources"}`.

**Root cause:** Supabase edge functions have ~256 MB RAM. The current Whisper code does:
1. Download full audio blob from Supabase Storage (1 copy)
2. Wrap in a `File` object (potential 2nd copy)
3. OpenAI SDK encodes as multipart for upload (3rd copy)

Audio ≥ ~15 MB blows the budget.

**Recovery:** For long (Recall/split) meetings this path is bypassed — `sarvam-webhook` and `process-meeting` both use **chunk-wise Whisper via the Vercel `api/split-audio` function** (`transcribe: "whisper"` mode): each 300 s chunk is ~1 MB, transcribed off-edge with 2 GB memory, so neither the edge OOM nor the 25 MB limit applies. Requires `OPENAI_API_KEY` in the Vercel env. The legacy in-edge `forceWhisper` path remains only for short audio. Manual fallback: [`/tmp/recover_meeting.py`](/tmp/recover_meeting.py).

---

### `whisper:audio_too_large`
**What it looks like:** Audio file size > 25 MB. Whisper API rejects with 413 or our pre-flight check throws `Audio file too large for Whisper (...). Whisper supports up to 25 MB.`

**Root cause:** OpenAI Whisper's hard 25 MB upload limit. Affects roughly any audio > ~25 minutes at standard MP3 bitrate.

**Recovery:** Automatic. `sarvam-webhook` retries via the Vercel splitter's chunk-wise Whisper mode (300 s chunks ≈ 1 MB each). `process-meeting` does the same when it is invoked on a long recording instead of throwing this error. The monitor re-fires `sarvam-webhook` for long meetings rather than `forceWhisper`. Whole-file Whisper is never used above 6 minutes or on multi-chunk jobs.

---

## Recall webhook errors

### `recall:race_bot_done_before_audio_mixed`
**What it looks like:** Meeting status flips to `failed` shortly after `bot.done` fires, even though `audio_mixed.done` is also processing in parallel. Old log: `[recall-webhook] Bot {id} done with no audio processed — marking as failed`.

**Root cause:** `recall-webhook` received `bot.done` and `audio_mixed.done` within ~16 ms of each other. The `bot.done` handler read the meeting row before the `audio_mixed.done` handler had finished writing `sarvam_job_id`, saw `sarvam_job_id = null`, and incorrectly marked the meeting failed.

**Fix shipped 2026-04-23:** `bot.done` handler now queries Recall's `/audio_mixed/` endpoint directly to check audio status. Only marks failed if Recall confirms `failed` or `missing`. `processing` / `done` / `unknown` → defers.

**Recovery if it happens again:** Manually flip status from `failed` back to `processing`, clear `error_message`, then re-trigger via `check-recall-status`.

---

### `recall:transcribing_deadlock`
**What it looks like:** Meeting status stuck at `transcribing` indefinitely. `check-recall-status` logs show `Sarvam job ... is COMPLETED but webhook was not received — triggering now`, then `sarvam-webhook` returns "Meeting already transcribing, skipping".

**Root cause:** `check-recall-status` was using `status = 'transcribing'` as an optimistic lock before calling `sarvam-webhook`. But `sarvam-webhook` had `'transcribing'` in its idempotency-skip list (to protect the Whisper-fallback path), so it refused to process. Two handlers communicating through the same string field with different meanings.

**Fix shipped 2026-04-23:** Added `meetings.sarvam_webhook_triggered_at` column. `check-recall-status` now uses an atomic `IS NULL` claim on that column instead of touching `status`. Lock is released on webhook failure so future polls can retry.

**Recovery if it happens again:** Manually `UPDATE meetings SET status = 'processing', sarvam_webhook_triggered_at = NULL` then call `sarvam-webhook` directly with the `sarvam_job_id`.

---

### `recall:bot_kicked_silent_failure`
**What it looks like:** Meeting status stuck in `processing` after the bot was clearly kicked from the waiting room. Recall events show `bot.call_ended` with `sub_code: timeout_exceeded_waiting_room` but nothing in our DB updates.

**Root cause:** `recall-webhook` (and other functions) wrote `error_message` to the `meetings` table on every failure path, but **the `error_message` column did not exist**. PostgREST silently rejects the entire UPDATE when any column is invalid — so the status update to `failed` never happened. The meeting stayed `processing` forever.

**Fix shipped 2026-04-25:** Added migration `20260424170000_meetings_error_message.sql`. The column now exists and writes succeed.

**Current behavior (2026-06-13):** A bot kicked / not admitted *before* it could record now resolves to a terminal **`cancelled`** status (neutral, not `failed`), via `recall-webhook`'s `CANCELLED_SUB_CODES` classification — see README challenge #23. A bot kicked *after* it has recorded still completes normally (`audio_mixed.done` arrives). `cancelled` is in the monitor's `TERMINAL_STATUSES`, and the `bot_kicked_waiting_room` harness scenario asserts `cancelled`.

**Recovery if it happens again:** This shouldn't recur. If it does, check whether another column referenced in the failing UPDATE was added by code without a matching migration.

---

## Upload ingest errors

### `stuck:uploading:never_arrived`
**What it looks like:** A meeting sits in status `uploading` and nothing else ever happens. No `sarvam_job_id`, no audio, no error.

**Root cause:** Not a fault. `prepare-upload` creates the meeting row *before* the bytes are sent, so that an authorised upload is visible and so `ingest-upload` has something to attach the Sarvam job to. If the user closes the tab, loses connection, or cancels the file picker, the row is all that ever exists.

**Why it is `cancelled`, not `failed`:** nothing was captured and nothing was spent — the same reasoning as a bot that was never admitted to the call (`recall:bot_kicked_silent_failure`). Failing it would put a red row on the user's dashboard for changing their mind, and would page `ALERT_EMAIL_TO` for a person closing a tab.

**Recovery:** automatic. The monitor marks it `cancelled` with `mark_cancelled`. Because the recovery *succeeds*, no alert is sent.

**Why the clock is six hours, not fifteen minutes:** nothing touches the row while the browser is uploading, so its age grows during a perfectly healthy upload. At the 15-minute threshold the monitor would cancel large files still in flight over slow connections. Six hours is past any plausible upload of the 2 GB ceiling and still bounded.

---

## Speaker mapping errors

### `speakers:phantom_speaker_when_one_participant`
**What it looks like:** A meeting with one participant shows `SPEAKER_01` segments interleaved with the real participant's name. Frontend renders two speakers when there was only one.

**Root cause:** Sarvam's diarization in translate mode often labels everyone as `speaker_id: 0`. Our per-segment mapping uses Recall's speaker timeline (which entries have a `participant.speech_on` event), but Recall's speech detection has a confidence threshold — short utterances ("hmm", "this", a cough) are transcribed by Sarvam but fall outside any Recall timeline window, so they get the `SPEAKER_XX` fallback.

**Fix shipped 2026-04-24:** When `recall_participants.length === 1`, short-circuit the timeline overlap logic and attribute every Sarvam segment to that single participant. For multi-participant meetings, added a nearest-neighbor fallback (closest Recall timeline entry by midpoint distance) so we never fall back to `SPEAKER_XX` if any Recall name is available.

---

## Database schema errors

### `db:missing_error_message_column`
**What it looks like:** Any UPDATE to `meetings` that includes `error_message` returns PostgREST error `PGRST204: Could not find the 'error_message' column`. Code paths writing it silently fail because they don't check the result.

**Root cause:** Code shipped writing to a column that was never added via migration.

**Fix shipped 2026-04-25:** `ALTER TABLE meetings ADD COLUMN error_message TEXT`.

**Lesson:** When edits add a new column reference in code, the harness `audio_mixed_failed_marks_meeting_failed` and `bot_kicked_waiting_room` scenarios will catch it.

---

## Auto-join errors

### `autojoin:duplicate_bots`
**What it looks like:** One calendar event has 2-3 `meetings` rows, all `source = 'auto-join'`, all with different `recall_bot_id`s, all created within 1-2 seconds of each other. Only one bot ever gets useful audio; the rest burn Recall minutes and land in `failed` / `cancelled`. Found in prod 2026-08-20: 79 events affected, 88 wasted bots.

**Root cause:** `auto-join-meetings` deduped with a plain `SELECT ... maybeSingle()` against `idx_meetings_calendar_source`, a **non-unique** index, and only INSERTed the meeting row *after* the Recall bot had been created. Two concurrent cron invocations both read "no existing meeting", both created a bot, and both inserted. The dedup was assuming a uniqueness guarantee the database never made.

**Fix shipped 2026-08-20:** Migration `20260820150000_autojoin_dedup_unique_index.sql` adds `meetings_autojoin_dedup`, a UNIQUE partial index on `(user_id, calendar_event_id, source) WHERE calendar_event_id IS NOT NULL`, and drops the redundant non-unique index. `auto-join-meetings` now INSERTs first to claim the event and only sends a bot once the insert succeeds; a losing racer gets `23505` and skips. If Recall then rejects the bot, the claim row is deleted so a later poll can retry.

**Note on the migration:** pre-existing duplicates are not deleted — the losing rows have their `calendar_event_id` set to NULL, which frees the unique slot while keeping the row visible to the user.

---

### `autojoin:bot_joins_meetings_nobody_attends`
**What it looks like:** Large numbers of auto-join meetings ending in "no audio captured", waiting-room timeouts, or the bot being removed. Prod 2026-08-20: 141 / 38 / 26 respectively, and auto-join accounted for **every** failure in the dataset (manual recordings were 19/19).

**Root cause:** Two compounding problems. (1) `auto-join-meetings` sent a bot to **any** calendar event carrying a video link — dead recurring series, declined invites, invitations the user never answered, meetings owned by other people. (2) `profiles.auto_join_enabled` defaulted to `true` until migration `20260820120000`, so every pre-existing account was opted in without asking.

**Fix shipped 2026-08-20:** `auto-join-meetings` now skips `event.status === 'cancelled'` and only joins when the user's own attendee entry has `responseStatus === 'accepted'`, or when they organize/created the event and haven't declined it. Migration `20260820150100` resets every existing profile to `auto_join_enabled = false`; users opt back in from Settings.

**Not the lever:** raising Recall's `automatic_leave.waiting_room_timeout` does not help — its default is already 1200 s (20 min), and the bot arrives only 7 min early. The waiting-room timeouts were bots nobody ever intended to admit.

---

### `pipeline:completed_with_no_transcript`
**What it looks like:** A meeting shows `status = 'completed'` in the dashboard, but has **no** row in `transcripts` (or an empty one) and insights that read "No clear speech detected". Always long meetings (66-72 min) with `processing_config.split_method` unset. The stuck-meeting monitor never fires because `completed` is terminal.

**Root cause:** A chain of silent fallbacks. `api/split-audio` is capped at `maxDuration: 300` (the Vercel Hobby ceiling) and could not download ~46 MB, re-encode ~15-20 chunks and upload them in time. `recall-pipeline` caught the failure and fell back to whole-file Sarvam submission — which cannot work for long audio (see `sarvam:silent_empty_output`). Sarvam returned an empty transcript, the Whisper fallback rejected the 45.9 MB file, and `process-meeting` then wrote `status = 'completed'` anyway with a placeholder "no clear speech" transcript row.

**Fix shipped 2026-08-20, four parts:**
1. `process-meeting` marks a meeting `failed` with an `error_message` when no usable transcript was produced, instead of `completed`, and no longer writes the placeholder transcript row or delivers an email.
2. `sarvam-webhook`'s chunk-wise Whisper retry (via the splitter's `transcribe: "whisper"` mode, which works at any length) was hoisted out of the chunked-only branch — it now runs for *any* empty Sarvam result, including whole-file fallbacks.
3. `recall-pipeline` records `split_method: "direct-fallback"` plus the reason in `split_error` whenever it submits whole-file, so the failure is diagnosable instead of invisible.
4. `api/split-audio` uploads chunks 6-way concurrently instead of serially, and returns an explicit 504 if it runs past its 270 s internal budget.

**Chunk encoding — settled 2026-08-20. Do not revisit without new measurements.**

Recall's `audio_mixed` output is **16 kHz mono 128 kbps mp3**, already Sarvam's preferred input. That makes the whole "optimise the encoding" idea moot — there is nothing to downsample to.

- **Stream-copy works and is the answer.** `-f segment -segment_format mp3 -c copy -reset_timestamps 1` segments a real 29-min Recall recording in **0.21 s vs 2.44 s** re-encoding, and Sarvam returned **28,426 chars vs the re-encode path's 28,557** — 0.5% apart, 6/6 chunks non-empty. Frame-aligned boundaries drift ≤0.02 s per chunk, well inside what fixed `chunk_seconds` stitching absorbs. The earlier claim that stream-copy fails with "Audio contains no samples" was wrong; that attempt almost certainly omitted `-segment_format mp3`, leaving ffmpeg to infer a container that does not carry copied frames.
- **Do not resample or drop the bitrate.** An A/B of `-ac 1 -ar 16000` at 48k and 32k corrupted technical vocabulary ("read/write" → "reed/right") and invented a phantom third speaker. That fixture was 24 kHz synthetic audio and so was NOT representative of production — but the conclusion holds for a simpler reason: re-encoding a file already at the target format is pure loss for zero gain.
- **Encoding was never the wall-clock bottleneck, and `maxDuration` was a misdiagnosis.** 2.44 s to re-encode 29 minutes extrapolates to ~6 s for 70 minutes against a 300 s budget. The long-meeting failures blamed on `maxDuration` were actually `storage:bucket_full_blocks_pipeline`: with the bucket full, `audio_url` was NULL and split-audio was never invoked at all. Buying Vercel Pro would have fixed nothing.

**If it recurs:** the meeting will now be `failed` with a specific `error_message`, and the Vercel logs for `api/split-audio` will show either the 504 budget message or the underlying ffmpeg/upload error. The durable fix is a Vercel Pro plan (`maxDuration: 800`).

---

### `pipeline:duration_from_wall_clock`
**What it looks like:** "Hours saved" and per-meeting duration are wildly inflated — a 70-minute meeting recovered hours later reports many hours.

**Root cause:** `processing_config.audio_duration_seconds` is only written by the split path, so any meeting that skipped chunking had no real duration and `process-meeting` fell straight through to wall-clock (`end_time - start_time`), which counts processing and recovery time.

**Fix shipped 2026-08-20:** `process-meeting` now uses the same precedence `sarvam-webhook` already used — real audio duration, then the last transcript segment's end time, then wall-clock.

---

### `pipeline:hallucination_detector_discards_long_transcript`
**What it looks like:** `sarvam-webhook` logs `Hallucinated Sarvam transcript, discarding:` followed by the opening lines of a perfectly normal conversation, then `Sarvam returned empty transcript for job …, falling back to Whisper`. The Sarvam job itself is `Completed` with a full `0.json` — `python3 scripts/check_sarvam_job.py <job_id>` says "Looks healthy". Long meetings only. 2026-08-31: a 60-minute call, 410 diarized entries, 53,543 characters, thrown away.

**Root cause:** `isLikelyHallucination` flagged any text whose `unique words / total words` was below 0.2. That ratio only means something for short text. Vocabulary grows sub-linearly with length (Heaps' law): the discarded transcript had 10,363 words and 1,531 distinct ones — 0.148 — while its own first 1,000 words scored 0.35 and its first 5,000 words 0.185. Every dense conversation past roughly 30–40 minutes was one vocabulary roll away from "no usable transcript", and because the discard happens *before* the Whisper fallback, a healthy Sarvam result was replaced by whatever the fallback managed — here nothing, see `storage:file_size_limit_skips_splitter`.

**Fix shipped 2026-08-31:** the ratio test now also requires the tiny *absolute* vocabulary of a real loop (fewer than 50 distinct words). "you you you…" and one sentence repeated for an hour still trip it; a real hour of conversation cannot. `supabase/functions/tests/hallucination_test.ts` holds a 10k-word synthetic transcript with the same statistics.

**If it recurs:** the Sarvam output is still on their side — PATCH the meeting `{status: "processing", sarvam_webhook_claimed_at: null, sarvam_webhook_triggered_at: null}` and POST `/functions/v1/sarvam-webhook` `{job_id, job_state: "COMPLETED"}` with the Sarvam webhook secret. Nothing needs re-transcribing.

---

## Storage errors

### `storage:bucket_full_blocks_pipeline`
**What it looks like:** Transcription stops working entirely, with no error anywhere. Meetings still finish and still say `completed`, but `audio_url` is NULL, `processing_config.split_method` is absent, and there is no transcript. Found 2026-08-20: the pipeline had been dead since 2026-08-14 and nothing alerted.

**Root cause:** The `recordings` bucket reached **1073 MB against the 1 GB free-tier cap**. Nothing had ever deleted archived audio, and each long meeting adds ~46 MB. Once the bucket is full, EVERY storage upload fails — and `recall-pipeline` only logs that failure and carries on. With no archived audio it cannot mint a signed URL, so it skips the splitter entirely (the `!uploadError` guard), submits the whole file to Sarvam (which returns an empty transcript above ~6 min — see `sarvam:silent_empty_output`), then falls back to whole-file Whisper, which rejects anything over 25 MB (`whisper:audio_too_large`). `process-meeting` then wrote `status='completed'` regardless (`pipeline:completed_with_no_transcript`).

Five separate failures chained, every one of them silent. The bucket being full was the first domino and the least visible.

**Fix shipped 2026-08-20:**
1. Deleted 388 MB of orphaned audio — 29 folders whose meeting row no longer existed. Bucket back to 685 MB with 339 MB headroom.
2. New `prune-recordings` edge function + daily 03:30 UTC cron (`20260820160000_prune_recordings_cron.sql`) deletes archived mp3s for meetings older than 30 days that already have a non-empty transcript, and drops to a 7-day retention if the bucket goes above 85% of the cap. It never deletes audio for a meeting we failed to transcribe — that is the one case where the recording is the only copy.
3. `recall-pipeline` now records `split_method: 'direct-fallback'` with `split_error` naming the storage failure, so this specific chain is greppable instead of invisible.
4. `process-meeting` marks transcript-less meetings `failed`, so the monitor and the user both find out.

**Check it manually:** `GET /functions/v1/prune-recordings?dry_run=1` reports current bucket bytes, headroom, and what would be deleted, without touching anything.

**If it recurs:** headroom is the number to watch. 1 GB is roughly 20 long meetings. Upgrading Supabase to Pro (100 GB) removes the ceiling; the prune job keeps growth flat either way.

---

### `storage:file_size_limit_skips_splitter`
**What it looks like:** A meeting longer than ~55 minutes ends `failed` with `error_message = "No usable transcript could be produced…"` a minute or two after the call ends. `audio_url` is NULL, `processing_config.split_method` is `direct-fallback`, and the recall-pipeline log shows `Storage upload error: StorageApiError: The object exceeded the maximum allowed size` (HTTP 413, `EntityTooLarge`). Found 2026-08-31 on a 60-minute call: 57,407,498 bytes.

**Root cause:** Supabase's project-wide `fileSizeLimit` is 52,428,800 bytes — 50 MiB, the Free-plan maximum (the `recordings` bucket itself has no limit of its own). Recall's `audio_mixed` is 128 kbps = 16,000 bytes/s, so anything past ~54.6 minutes is rejected. Nothing was wrong with the recording; the damage was downstream. The splitter call was guarded by `!uploadError` because it signed the *Storage* copy, so the whole 57 MB went to Sarvam as ONE job — and every Whisper fallback (the chunk-wise retry in `sarvam-webhook`, the long-meeting and oversize branches in `process-meeting`) was keyed on `meeting.audio_url` and silently skipped. `process-meeting` then reported `noAudioDetected: true` about a second after being called, having never seen any audio. This is the same "no archive ⇒ no splitter" chain that was the second domino in `storage:bucket_full_blocks_pipeline`.

**Fix shipped 2026-08-31:**
1. `recall-pipeline` hands the splitter the archived copy when there is one and **Recall's own download URL** otherwise, so chunking no longer depends on Storage at all. `processing_config` records `split_source: storage|recall` and, when the archive failed, `archive_error`.
2. `_shared/whisper-chunked.ts` gained `resolveSplitterSourceUrl` / `transcribeMeetingViaSplitAudio`: the chunk-wise Whisper fallbacks in `sarvam-webhook` and `process-meeting` read from the archive or straight from Recall (`recall_bot_id`), whichever exists.
3. `process-meeting` says "No audio to transcribe: the recording was not archived and no Recall bot is attached" when it truly has nothing, instead of blaming silence.

**What is NOT fixed:** long meetings still get no archived mp3 (`audio_url` stays NULL). Playback uses Recall's mp4 for 7 days and has no fallback after that, and `/tmp/recover_meeting.py` cannot be used for them — pull the audio from Recall instead. Raising the cap needs Supabase Pro.

**Check it manually:** `GET https://api.supabase.com/v1/projects/lekkpfpojlspbuwrtmzt/config/storage` → `fileSizeLimit`.

---

## Email delivery errors

### `resend:cloudflare_1010_false_alarm`
**What it looks like:** Any call to `api.resend.com` from a local script returns `HTTP 403` with the plain-text body `error code: 1010`. Every endpoint fails identically — even read-only `GET /domains`, and even from Resend's own `onboarding@resend.dev` test sender — which makes it look exactly like a revoked key or a suspended account.

**Root cause:** It is not Resend. `api.resend.com` sits behind Cloudflare bot protection, which bans **Python's default `User-Agent`** (`Python-urllib/3.x`). `1010` is a Cloudflare code ("banned based on your browser's signature"), not a Resend error code.

**The tell:** Resend's real errors are JSON — `{"name": "invalid_api_key", "message": ...}`. A plain-text body means the response never reached Resend's API layer. When a hosted API 403s but the error body is not that API's documented shape, suspect the CDN in front of it before the credential.

**Fix:** send any ordinary `User-Agent` header. Verified 2026-08-20: `Deno/2.1.4`, `node` and a browser string all return 200; only the urllib default is blocked. **Supabase edge functions are unaffected** — Deno's `fetch` sets its own UA — so this only ever bites local debugging scripts.

### `email:duplicate_summary_per_meeting`
**What it looks like:** the user receives the **same summary email 2-3 times** for one meeting, seconds apart. Resend shows several sends with identical subjects; the edge logs show `sarvam-webhook` starting more than once for the same `job_id`, each run ending in `Sending email to: …`.

**Root cause:** two compounding problems, found 2026-08-21 from prod logs.
1. `sarvam-webhook` answers Sarvam only *after* it has downloaded, stitched, generated GPT insights and sent the email — ~21 s for a 15-minute meeting. Sarvam treats that as a lost callback and **replays it every ~8 s** (three deliveries observed for job `20260821_931079dc…`).
2. The idempotency guard was a **read-then-check** on `meetings.status`. All replays read `processing` before the first one wrote `completed`, so every replay processed and every replay emailed.

**Fix shipped 2026-08-21** (migration `20260821180000_email_delivery_dedup.sql`):
- `email_deliveries` claim table, UNIQUE on `(meeting_id, lower(recipient_email), kind)`. `send-meeting-email` inserts the claim **before** calling Resend; a loser gets `23505` and returns `{ success: true, skipped: true, reason: "already_sent" }`. The claim is released if the send fails so a real retry can still deliver.
- `meetings.sarvam_webhook_claimed_at`: an atomic in-flight claim so duplicate callbacks skip instead of re-running the pipeline (3× GPT spend). Claims older than 10 min are re-claimable, so a died-mid-way run is never stranded; the claim is released on error.

**No monitor signature.** This never leaves a meeting stuck — the meeting completes correctly, it is only delivered too many times — so there is nothing for `known-patterns.ts` to mirror. Regression cover lives in the harness instead: `summary_email_deduped_per_recipient` and the strengthened `concurrent_sarvam_webhooks`.

**If it recurs:** check `select recipient_email, count(*) from email_deliveries where meeting_id = '…' group by 1` — more than one row per recipient means the unique index is gone; zero rows next to a delivered email means `claimEmailDelivery` fell through its fail-open path (look for `[email-delivery] Claim failed` in the logs).

---

**Why it is written down:** — "the Resend key is revoked, all six email functions are dead, users are not receiving their meeting summaries." The key was valid throughout and `echobrief.in` was verified the whole time. Production's `email_sent: false` had a separate, real cause: the deployed `RESEND_API_KEY` was a different, stale key than the working one in `.env`.

---

## Instance / platform errors

### `instance:disk_io_above_baseline`
**What it looks like:** Supabase emails "your project is depleting its Disk IO Budget", or — if nobody acted on that — the API simply stops answering: PostgREST returns **HTTP 522 after ~90 s** and the metrics endpoint hangs, while the Management API still reports `ACTIVE_HEALTHY`. The monitor now catches the condition before that, emailing `[ECHOBRIEF] Disk IO above baseline` once sustained IO exceeds the compute tier's baseline for two consecutive 15-minute windows.

**Root cause:** usually **not the database.** The instance has two block devices and Postgres only owns one of them. On 2026-09-08 the `pgdata` volume was idle at 0.1% busy while the root volume ran at 10.5 MB/s, because a free-tier Nano (431 MB RAM against ~1.4 GB committed) was swapping continuously. `pg_stat_statements` and table sizes cannot see this — they only report on the volume Postgres owns, and will say "idle" while the machine thrashes.

**Recovery:** `none` — the monitor logs and emails, it does not act. Then:
1. Run **`scripts/disk-io-probe.sh`** and read the per-device split. If `nvme1n1` (pgdata) is a small share, no query or cron change can help.
2. **Restart the instance:** `POST https://api.supabase.com/v1/projects/<ref>/restart`. Takes ~5 min. On 2026-09-08 this took the draw from 11.85 MB/s (2.4x the Nano baseline) to a settled ~2 MB/s, because the cost was accumulated state over 165 days of uptime — not an undersized tier.
3. Re-measure after ~30 min; the boot storm is not the steady state.
4. Only if the recurrence interval becomes short is a compute upgrade the answer. Nano baseline is 5 MB/s / 250 IOPS, Micro 11/500, Small 22/1000, and add-ons require the Pro plan.

**If pgdata IS a large share,** the database really is implicated and this is the 2026-06 situation instead (see engineering-notes #22): check `pg_stat_statements`, keyed on `(userid, dbid, toplevel, queryid)` — **the same queryid appears more than once**, and diffing on queryid alone invents runaways that are not there.

**Detection detail:** rates come from diffing raw counters between two monitor ticks (~15 min apart), stored in `instance_io_samples`. The counters are since-boot, so a restart makes the delta negative — that is a reboot, not a rate, and is discarded. Do not shorten the sampling window: the metrics endpoint is scraped about every 60 s, so anything under ~75 s aliases into alternating zero and double-rate readings that look exactly like a bursty workload.

---

## Data integrity errors

### `data:completed_without_transcript`

**Symptom:** A meeting reads `status = completed` on the dashboard, its Transcript tab
is empty, and Regenerate fails with `Meeting has no transcript to regenerate from`.
Its summary is the placeholder: *"No clear speech was detected in this recording…"*.

**Detection:** `monitor-stuck-meetings` checks the last 48 h of completed meetings
against `transcripts` on every tick (`integrity.ts`). This is deliberately separate
from the stuck sweep, which queries only NON-terminal statuses — `completed` is
terminal, so a meeting that finishes with the wrong status is invisible to it.

**Root cause:** Sarvam returned an empty transcript (`sarvam:silent_empty_output`)
and the pipeline treated "nothing to transcribe" as success: it wrote the
placeholder insights, skipped the transcript row, and marked the meeting complete.
The meeting then looked healthy, consumed plan quota, and could not be regenerated
— there is nothing to regenerate from.

**Found:** 2026-09-09, while backfilling insights after the timestamp-anchoring fix.
Nine meetings, all dated 2026-07-22 to 08-19, i.e. before the guards below existed.
Six of them were three calls × two bots: two users on the same invite each get their
own bot, so one bad call produces two bad meetings.

**Recovery:** None automatic, and usually none at all. The archived audio is cleared
by `prune-recordings` after 30 days and Recall drops its own copy after 7, so by the
time anyone notices there is nothing left to re-transcribe. Inside those windows,
re-run `process-meeting` with `forceWhisper: true`.

**Status:** FIXED at both writers — `sarvam-webhook`'s empty-transcript branch marks
the meeting `failed` (or falls back to Whisper), and `process-meeting`'s
`noUsableTranscript` branch does the same. **A fresh occurrence means one of those
guards has regressed, or a new writer skipped them.** Covered by
`supabase/functions/tests/integrity_test.ts`.

## How this file is maintained

1. The `monitor-stuck-meetings` cron carries a `KNOWN_SIGNATURES` set in code. When it detects a stuck meeting whose signature is **not** in that set, it sends an email to `ALERT_EMAIL_TO` (default `admin@oltaflock.ai`) with subject `[ECHOBRIEF NEW ERROR] <signature>`.
2. When you receive such an email, investigate the meeting, then:
   - Add the new error to this file with the same structure (signature / what it looks like / root cause / recovery).
   - Add the signature to `KNOWN_SIGNATURES` in [`supabase/functions/monitor-stuck-meetings/known-patterns.ts`](supabase/functions/monitor-stuck-meetings/known-patterns.ts).
   - Add a recovery handler (or `none` if manual-only) and redeploy.
3. The full audit trail of every error the cron has ever seen lives in the `monitor_events` table. `errors.md` is the curated runbook; `monitor_events` is the raw history.
