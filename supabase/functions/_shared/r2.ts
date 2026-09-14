/**
 * Minimal Cloudflare R2 client: SigV4 over plain fetch.
 *
 * R2 speaks the S3 API, but the AWS SDK is a heavy import for an edge function
 * that needs four calls (multipart put, presigned get, delete, head). Signing is
 * done here with WebCrypto and checked in tests against AWS's own published
 * example, so a signing bug fails the unit harness instead of every upload.
 *
 * Uploads are multipart in 8 MB parts read straight off the source stream: a
 * two-hour meeting's audio is ~115 MB, and buffering that in an isolate is how
 * Whisper already runs out of memory (errors.md `whisper:oom`).
 */

const enc = new TextEncoder();

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(data: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(data)));
}

async function hmac(key: BufferSource, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(data));
}

/** RFC 3986 encoding as S3 expects: everything but unreserved, slashes optional. */
export function uriEncode(value: string, encodeSlash = true): string {
  return Array.from(enc.encode(value)).map((byte) => {
    const c = String.fromCharCode(byte);
    if (/[A-Za-z0-9\-._~]/.test(c) || (!encodeSlash && c === "/")) return c;
    return `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }).join("");
}

export interface SigningCreds {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

function amzDates(now: Date): { amzDate: string; day: string } {
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return { amzDate, day: amzDate.slice(0, 8) };
}

async function signingKey(secret: string, day: string, region: string): Promise<ArrayBuffer> {
  const kDate = await hmac(enc.encode(`AWS4${secret}`), day);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

function canonicalQuery(params: Record<string, string>): string {
  return Object.keys(params).sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(params[k])}`)
    .join("&");
}

/** A presigned GET URL. `path` is the already-slash-separated object path, e.g. `/bucket/key`. */
export async function presignGet(
  creds: SigningCreds,
  host: string,
  path: string,
  expiresSeconds: number,
  now = new Date(),
): Promise<string> {
  const { amzDate, day } = amzDates(now);
  const scope = `${day}/${creds.region}/s3/aws4_request`;
  const params: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${creds.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresSeconds),
    "X-Amz-SignedHeaders": "host",
  };
  const canonicalPath = uriEncode(path, false);
  const canonical = ["GET", canonicalPath, canonicalQuery(params), `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonical)].join("\n");
  const signature = hex(await hmac(await signingKey(creds.secretAccessKey, day, creds.region), toSign));
  return `https://${host}${canonicalPath}?${canonicalQuery(params)}&X-Amz-Signature=${signature}`;
}

/** Header-signed request. The body is never hashed: R2 accepts UNSIGNED-PAYLOAD. */
async function signedFetch(
  creds: SigningCreds,
  host: string,
  method: string,
  path: string,
  query: Record<string, string>,
  body?: BodyInit | null,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  const { amzDate, day } = amzDates(new Date());
  const scope = `${day}/${creds.region}/s3/aws4_request`;
  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
    "x-amz-date": amzDate,
    ...Object.fromEntries(Object.entries(extraHeaders).map(([k, v]) => [k.toLowerCase(), v])),
  };
  const names = Object.keys(headers).sort();
  const canonicalPath = uriEncode(path, false);
  const canonical = [
    method,
    canonicalPath,
    canonicalQuery(query),
    names.map((n) => `${n}:${headers[n].trim()}\n`).join(""),
    names.join(";"),
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonical)].join("\n");
  const signature = hex(await hmac(await signingKey(creds.secretAccessKey, day, creds.region), toSign));
  const qs = canonicalQuery(query);
  const { host: _h, ...sendHeaders } = headers;
  return fetch(`https://${host}${canonicalPath}${qs ? `?${qs}` : ""}`, {
    method,
    body: body ?? undefined,
    headers: {
      ...sendHeaders,
      Authorization: `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`,
    },
  });
}

export interface R2Config extends SigningCreds {
  host: string;
  bucket: string;
}

/** Null when any R2 secret is unset — the archive is optional, never a crash. */
export function r2FromEnv(): R2Config | null {
  const accountId = Deno.env.get("R2_ACCOUNT_ID");
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const bucket = Deno.env.get("R2_BUCKET");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { host: `${accountId}.r2.cloudflarestorage.com`, bucket, accessKeyId, secretAccessKey, region: "auto" };
}

const objectPath = (cfg: R2Config, key: string) => `/${cfg.bucket}/${key}`;

export function r2PresignGet(cfg: R2Config, key: string, expiresSeconds: number): Promise<string> {
  return presignGet(cfg, cfg.host, objectPath(cfg, key), expiresSeconds);
}

export async function r2Delete(cfg: R2Config, key: string): Promise<void> {
  const res = await signedFetch(cfg, cfg.host, "DELETE", objectPath(cfg, key), {});
  // 204 on success; 404 means it is already gone, which is the goal.
  if (!res.ok && res.status !== 404) throw new Error(`R2 delete ${res.status}: ${(await res.text()).slice(0, 200)}`);
  await res.body?.cancel();
}

export const PART_BYTES = 8 * 1024 * 1024;

/** Stream `source` into R2 in 8 MB parts. Returns the number of bytes stored. */
export async function r2UploadStream(
  cfg: R2Config,
  key: string,
  source: ReadableStream<Uint8Array>,
  contentType: string,
): Promise<number> {
  const path = objectPath(cfg, key);
  const init = await signedFetch(cfg, cfg.host, "POST", path, { uploads: "" }, null, { "content-type": contentType });
  const initText = await init.text();
  if (!init.ok) throw new Error(`R2 create multipart ${init.status}: ${initText.slice(0, 200)}`);
  const uploadId = initText.match(/<UploadId>([^<]+)<\/UploadId>/)?.[1];
  if (!uploadId) throw new Error("R2 create multipart: no UploadId");

  const etags: string[] = [];
  let total = 0;
  try {
    const reader = source.getReader();
    let buffer = new Uint8Array(PART_BYTES);
    let filled = 0;
    const flush = async () => {
      if (filled === 0) return;
      const partNumber = etags.length + 1;
      const res = await signedFetch(cfg, cfg.host, "PUT", path, { partNumber: String(partNumber), uploadId }, buffer.slice(0, filled));
      if (!res.ok) throw new Error(`R2 upload part ${partNumber} ${res.status}: ${(await res.text()).slice(0, 200)}`);
      await res.body?.cancel();
      const etag = res.headers.get("etag");
      if (!etag) throw new Error(`R2 upload part ${partNumber}: no ETag`);
      etags.push(etag);
      total += filled;
      buffer = new Uint8Array(PART_BYTES);
      filled = 0;
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      let offset = 0;
      while (offset < value.length) {
        const take = Math.min(PART_BYTES - filled, value.length - offset);
        buffer.set(value.subarray(offset, offset + take), filled);
        filled += take;
        offset += take;
        if (filled === PART_BYTES) await flush();
      }
    }
    await flush();
    if (etags.length === 0) throw new Error("R2 upload: source was empty");

    const xml = `<CompleteMultipartUpload>${
      etags.map((e, i) => `<Part><PartNumber>${i + 1}</PartNumber><ETag>${e}</ETag></Part>`).join("")
    }</CompleteMultipartUpload>`;
    const done = await signedFetch(cfg, cfg.host, "POST", path, { uploadId }, xml, { "content-type": "application/xml" });
    const doneText = await done.text();
    if (!done.ok || /<Error>/.test(doneText)) throw new Error(`R2 complete multipart ${done.status}: ${doneText.slice(0, 200)}`);
    return total;
  } catch (err) {
    // An abandoned multipart upload still occupies storage until aborted.
    await signedFetch(cfg, cfg.host, "DELETE", path, { uploadId }).then((r) => r.body?.cancel()).catch(() => {});
    throw err;
  }
}
