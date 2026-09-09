-- One share link per meeting from here on, and it can be looked at again.
--
-- What was wrong with the old shape, both reported from real use:
--
--   1. Every press of "Create share link" minted another live link. A meeting
--      could carry six, each with its own expiry and its own idea of whether it
--      carried the transcript, and revoking "the link you sent" meant guessing
--      which of six that was.
--   2. The token was stored ONLY as a sha256 digest, so after the dialog closed
--      the URL was gone forever. Losing a link you had just made meant minting
--      another one — which is also how meetings ended up carrying six.
--
-- `token_sealed` fixes (2): the token, encrypted with TOKEN_ENCRYPTION_KEY —
-- the same AES-256-GCM envelope `_shared/crypto.ts` puts around OAuth tokens —
-- so the dialog can show the link again. This IS a real weakening over
-- hash-only storage: a database dump plus the key yields live share links. It
-- is the deliberate price of a share dialog people can use, and hash-only is
-- what made minting a seventh link the easiest way out of losing the sixth.
-- The digest stays and is still what `get-shared-meeting` matches on; the
-- sealed copy is opened only for the owner's own dialog.
--
-- (1) is enforced in `manage-meeting-share`, NOT by a unique index, and that is
-- the point: EVERY LINK ALREADY IN SOMEBODY'S INBOX KEEPS WORKING. An index
-- would have required revoking the backlog to be creatable, which would break
-- exactly the links this table exists to honour. Going forward `create` returns
-- the existing live link instead of minting a second one and `rotate` revokes
-- before it inserts, so no meeting gains a duplicate from here — and the
-- function is the only writer there is, since `meeting_shares` has no INSERT
-- policy and only the service role can mint a valid token hash.
--
-- Links that predate this migration have no sealed token and can never be shown
-- again — nothing can recover them. They keep working; the dialog lists them as
-- older links with a revoke button, which is the honest offer.

ALTER TABLE public.meeting_shares
  ADD COLUMN IF NOT EXISTS token_sealed text;

COMMENT ON COLUMN public.meeting_shares.token_sealed IS
  'The share token sealed with TOKEN_ENCRYPTION_KEY (_shared/crypto.ts), so the '
  'owner can see their own link again. NULL for links minted before '
  '20260909150000 — those stay live but their URL is unrecoverable. Never read '
  'by the public share path, which matches on token_hash.';

-- Deliberately NO unique index and NO revoking of existing rows. See above: the
-- one-live-link rule is a rule about what we CREATE, not a claim about what is
-- already out there.
