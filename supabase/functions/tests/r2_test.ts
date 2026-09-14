/**
 * R2 signing. The positive control is AWS's own published SigV4 example: if
 * this signature is wrong, every upload would 403 and nothing else would say why.
 * https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
 */
import { assertEquals, assertNotEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { presignGet, uriEncode } from "../_shared/r2.ts";

const AWS_EXAMPLE = {
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  region: "us-east-1",
};

Deno.test("presignGet reproduces AWS's published example signature", async () => {
  const url = await presignGet(
    AWS_EXAMPLE,
    "examplebucket.s3.amazonaws.com",
    "/test.txt",
    86400,
    new Date("2013-05-24T00:00:00Z"),
  );
  assertEquals(
    new URL(url).searchParams.get("X-Amz-Signature"),
    "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
  );
});

Deno.test("presignGet signature changes with the secret (negative control)", async () => {
  const url = await presignGet(
    { ...AWS_EXAMPLE, secretAccessKey: "not-the-secret" },
    "examplebucket.s3.amazonaws.com",
    "/test.txt",
    86400,
    new Date("2013-05-24T00:00:00Z"),
  );
  assertNotEquals(
    new URL(url).searchParams.get("X-Amz-Signature"),
    "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
  );
});

Deno.test("uriEncode follows S3's rules", () => {
  assertEquals(uriEncode("a b/c~d", false), "a%20b/c~d");
  assertEquals(uriEncode("a/b"), "a%2Fb");
});
