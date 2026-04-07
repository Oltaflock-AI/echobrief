const SARVAM_BASE_URL = "https://api.sarvam.ai/speech-to-text/job/v1";

interface SarvamJobResponse {
  job_id: string;
  storage_container_type: string;
  job_parameters: Record<string, unknown>;
  job_state: string;
}

interface FileSignedURLDetails {
  file_url: string;
  file_metadata: Record<string, unknown> | null;
}

interface SarvamUploadResponse {
  job_id: string;
  job_state: string;
  upload_urls: Record<string, FileSignedURLDetails>;
  storage_container_type: string;
}

interface SarvamDownloadResponse {
  job_id: string;
  job_state: string;
  download_urls: Record<string, FileSignedURLDetails>;
  storage_container_type: string;
}

export async function createSarvamJob(
  apiKey: string,
  callbackUrl: string,
  callbackToken: string,
): Promise<SarvamJobResponse> {
  const res = await fetch(SARVAM_BASE_URL, {
    method: "POST",
    headers: {
      "api-subscription-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      job_parameters: {
        model: "saaras:v3",
        mode: "transcribe",
        with_diarization: true,
        with_timestamps: true,
        language_code: "unknown",
      },
      callback: {
        url: callbackUrl,
        auth_token: callbackToken,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sarvam create job failed (${res.status}): ${err}`);
  }
  return res.json();
}

export async function uploadToSarvamJob(
  apiKey: string,
  jobId: string,
  fileName: string,
  audioBlob: Blob,
): Promise<void> {
  // Step 1: Get presigned upload URL
  const uploadRes = await fetch(`${SARVAM_BASE_URL}/upload-files`, {
    method: "POST",
    headers: {
      "api-subscription-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      job_id: jobId,
      files: [fileName],
    }),
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Sarvam get upload URL failed (${uploadRes.status}): ${err}`);
  }

  const uploadData: SarvamUploadResponse = await uploadRes.json();
  const presignedUrl = uploadData.upload_urls?.[fileName]?.file_url;

  if (!presignedUrl) {
    throw new Error(
      `No presigned upload URL returned from Sarvam for file "${fileName}". Response: ${JSON.stringify(uploadData)}`,
    );
  }

  // Step 2: PUT the audio file to the presigned URL
  const putRes = await fetch(presignedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/octet-stream",
      "x-ms-blob-type": "BlockBlob",
    },
    body: audioBlob,
  });

  if (!putRes.ok) {
    const err = await putRes.text();
    throw new Error(`Sarvam file upload failed (${putRes.status}): ${err}`);
  }
}

export async function getSarvamJobStatus(
  apiKey: string,
  jobId: string,
): Promise<{ job_id: string; job_state: string }> {
  const res = await fetch(`${SARVAM_BASE_URL}/${jobId}/status`, {
    method: "GET",
    headers: {
      "api-subscription-key": apiKey,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sarvam get job status failed (${res.status}): ${err}`);
  }
  return res.json();
}

export async function startSarvamJob(
  apiKey: string,
  jobId: string,
): Promise<void> {
  const res = await fetch(`${SARVAM_BASE_URL}/${jobId}/start`, {
    method: "POST",
    headers: {
      "api-subscription-key": apiKey,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sarvam start job failed (${res.status}): ${err}`);
  }
}

export async function downloadSarvamResults(
  apiKey: string,
  jobId: string,
  fileName: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${SARVAM_BASE_URL}/download-files`, {
    method: "POST",
    headers: {
      "api-subscription-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      job_id: jobId,
      files: [fileName],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sarvam download failed (${res.status}): ${err}`);
  }

  const downloadData: SarvamDownloadResponse = await res.json();
  const downloadUrl = downloadData.download_urls?.[fileName]?.file_url;

  if (!downloadUrl) {
    throw new Error(
      `No presigned download URL returned from Sarvam for file "${fileName}". Response: ${JSON.stringify(downloadData)}`,
    );
  }

  const fileRes = await fetch(downloadUrl);
  if (!fileRes.ok) {
    throw new Error(`Failed to fetch Sarvam result file (${fileRes.status})`);
  }

  return fileRes.json();
}
