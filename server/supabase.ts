import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || "";

export const supabase = supabaseUrl ? createClient(supabaseUrl, supabaseKey) : null;

export async function uploadFile(bucket: string, path: string, file: Buffer, contentType: string): Promise<string | null> {
  if (!supabase) {
    // Fallback to local storage
    const fs = await import("fs");
    const localPath = `uploads/${path}`;
    const dir = localPath.substring(0, localPath.lastIndexOf("/"));
    if (dir) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(localPath, file);
    return localPath;
  }
  const { data, error } = await supabase.storage.from(bucket).upload(path, file, { contentType, upsert: true });
  if (error) throw error;
  return data.path;
}

export async function downloadFile(bucket: string, path: string): Promise<Buffer | null> {
  if (!supabase) {
    const fs = await import("fs");
    if (fs.existsSync(path)) return fs.readFileSync(path);
    return null;
  }
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

export async function deleteFile(bucket: string, path: string): Promise<void> {
  if (!supabase) {
    const fs = await import("fs");
    try { fs.unlinkSync(path); } catch {}
    return;
  }
  await supabase.storage.from(bucket).remove([path]);
}
