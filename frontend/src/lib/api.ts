import { JobResponse } from '../types';

export async function checkHealth(): Promise<{ ok: boolean; dummy: boolean }> {
  const res = await fetch('/api/health');
  if (!res.ok) {
    throw new Error(`Health check failed with status ${res.status}`);
  }
  return res.json();
}

export async function createJob(target: File | string): Promise<string> {
  let url = '/api/jobs';
  let init: RequestInit = { method: 'POST' };

  if (typeof target === 'string') {
    url += `?sample=${encodeURIComponent(target)}`;
  } else {
    const formData = new FormData();
    formData.append('file', target);
    init.body = formData;
  }

  const res = await fetch(url, init);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Job creation failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.job_id;
}

export async function pollJob(
  jobId: string,
  onUpdate?: (job: JobResponse) => void,
  intervalMs = 450
): Promise<JobResponse> {
  while (true) {
    const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`);
    if (!res.ok) {
      throw new Error(`Polling failed with status ${res.status}`);
    }
    const job: JobResponse = await res.json();
    if (onUpdate) onUpdate(job);

    if (job.status === 'done') {
      return job;
    }
    if (job.status === 'error') {
      throw new Error(job.error || 'Job failed during execution');
    }

    await new Promise(r => setTimeout(r, intervalMs));
  }
}

export async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch file from ${url}: status ${res.status}`);
  }
  return res.arrayBuffer();
}

export async function fetchJson<T = any>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch JSON from ${url}: status ${res.status}`);
  }
  return res.json();
}
