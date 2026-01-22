import { env } from '../env.js';

/**
 * Optional helper for Supabase Storage (server-side).
 * Requires SUPABASE_SERVICE_ROLE_KEY for uploads.
 */
export async function uploadToSupabaseStorage(path: string, contentType: string, data: Buffer) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');
  }
  const url = `${env.SUPABASE_URL}/storage/v1/object/${env.SUPABASE_STORAGE_BUCKET}/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'true'
    },
    body: data
  });
  if (!res.ok) throw new Error(`Supabase storage upload failed: ${res.status} ${await res.text()}`);
  return url;
}
