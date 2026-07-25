import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/** Uploads are streamed straight to disk — never buffered in memory — so
 *  large assets work inside the 2 GB container. Bytes live under
 *  RECTILE_FILES_DIR (default ./data/files), keyed by file row id. */

export const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500 MB

export function filesDir(): string {
  return process.env.RECTILE_FILES_DIR ?? join(process.cwd(), "data", "files");
}

export function filePath(id: number): string {
  return join(filesDir(), String(id));
}

export class FileTooLargeError extends Error {}

/** Stream a request body to a temp path, hashing and size-capping on the
 *  fly. Returns size + sha256. Caller renames/deletes the temp file. */
export async function streamToFile(
  body: ReadableStream<Uint8Array>,
  destPath: string,
): Promise<{ size: number; sha256: string }> {
  await mkdir(filesDir(), { recursive: true });
  const hash = createHash("sha256");
  let size = 0;
  const source = Readable.fromWeb(body as import("node:stream/web").ReadableStream);
  const counter = async function* () {
    for await (const chunk of source) {
      size += chunk.length;
      if (size > MAX_FILE_BYTES) throw new FileTooLargeError("file exceeds 500 MB");
      hash.update(chunk);
      yield chunk;
    }
  };
  await pipeline(counter(), createWriteStream(destPath));
  return { size, sha256: hash.digest("hex") };
}

export async function removeStoredFile(id: number): Promise<void> {
  await rm(filePath(id), { force: true });
}

export async function storedFileSize(id: number): Promise<number | null> {
  try {
    return (await stat(filePath(id))).size;
  } catch {
    return null;
  }
}
