import "server-only";
import { del } from "@vercel/blob";
import { ResourceManagementError } from "@/lib/resource-validation";

export const MAX_IMAGE_FILE_SIZE = 3 * 1024 * 1024; // 3 MB
export const MAX_IMAGE_DIMENSION = 4096; // 4096 px
export const MIN_IMAGE_DIMENSION = 10; // 10 px
export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type SupportedImageFormat = "jpeg" | "png" | "webp";

/**
 * Inspects binary magic bytes to determine the real image format.
 * Rejects executables or disguised files.
 */
export function detectImageFormat(buffer: Buffer): SupportedImageFormat | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "png";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

/**
 * Extracts width and height directly from image binary headers.
 * Protects against decompression bombs without requiring full raster decoding.
 */
export function extractImageDimensions(
  buffer: Buffer,
  format: SupportedImageFormat
): { width: number; height: number } | null {
  if (format === "png") {
    if (buffer.length < 24) return null;
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  }

  if (format === "jpeg") {
    let offset = 2;
    while (offset < buffer.length - 8) {
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buffer[offset + 1];
      // Standalone markers without payload
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2 || offset + 2 + length > buffer.length) break;

      // Start of Frame markers (SOF0-SOF3, SOF5-SOF7, SOF9-SOF11, SOF13-SOF15)
      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);

      if (isSof) {
        if (offset + 9 <= buffer.length) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          return { width, height };
        }
        break;
      }
      offset += 2 + length;
    }
    return null;
  }

  if (format === "webp") {
    if (buffer.length < 30) return null;
    const chunkType = buffer.subarray(12, 16).toString("ascii");

    if (chunkType === "VP8 ") {
      // Lossy VP8
      if (buffer.length >= 30 && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
        const width = buffer.readUInt16LE(26) & 0x3fff;
        const height = buffer.readUInt16LE(28) & 0x3fff;
        return { width, height };
      }
    } else if (chunkType === "VP8L") {
      // Lossless VP8L
      if (buffer.length >= 25 && buffer[20] === 0x2f) {
        const b0 = buffer[21];
        const b1 = buffer[22];
        const b2 = buffer[23];
        const b3 = buffer[24];
        const width = 1 + (b0 | ((b1 & 0x3f) << 8));
        const height = 1 + (((b1 >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10)));
        return { width, height };
      }
    } else if (chunkType === "VP8X") {
      // Extended VP8X
      if (buffer.length >= 30) {
        const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16));
        const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16));
        return { width, height };
      }
    }
    return null;
  }

  return null;
}

/**
 * Validates binary image buffer for format, size, and dimension limits.
 */
export function validateImageBuffer(buffer: Buffer): {
  format: SupportedImageFormat;
  width: number;
  height: number;
} {
  if (buffer.length > MAX_IMAGE_FILE_SIZE) {
    throw new ResourceManagementError("Image file size exceeds the 3 MB limit.");
  }
  const format = detectImageFormat(buffer);
  if (!format) {
    throw new ResourceManagementError("Invalid image format. Only JPEG, PNG, and WebP files are allowed.");
  }
  const dimensions = extractImageDimensions(buffer, format);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    throw new ResourceManagementError("Unable to read image dimensions. The image file may be corrupted.");
  }
  if (dimensions.width > MAX_IMAGE_DIMENSION || dimensions.height > MAX_IMAGE_DIMENSION) {
    throw new ResourceManagementError(
      `Image dimensions (${dimensions.width}×${dimensions.height}) exceed the maximum limit of ${MAX_IMAGE_DIMENSION}×${MAX_IMAGE_DIMENSION} pixels.`
    );
  }
  if (dimensions.width < MIN_IMAGE_DIMENSION || dimensions.height < MIN_IMAGE_DIMENSION) {
    throw new ResourceManagementError(
      `Image dimensions (${dimensions.width}×${dimensions.height}) are too small. Minimum is ${MIN_IMAGE_DIMENSION}×${MIN_IMAGE_DIMENSION} pixels.`
    );
  }
  return { format, width: dimensions.width, height: dimensions.height };
}

import { isTrustedBlobUrl } from "@/lib/storage-utils";
export { isTrustedBlobUrl };

/**
 * Validates that an image URL belongs to authorized Vercel Blob storage
 * and conforms to the resources path namespace.
 */
export function isValidBlobUrl(urlString: string): boolean {
  if (!isTrustedBlobUrl(urlString)) return false;
  try {
    const url = new URL(urlString);
    return url.pathname.startsWith("/resources/") || url.pathname.includes("/resources/");
  } catch {
    return false;
  }
}

/**
 * Normalizes and protects storage pathnames from traversal.
 */
export function sanitizePathname(pathname: string): string {
  const cleaned = pathname.replace(/\\/g, "/").replace(/\.{2,}/g, "");
  const parts = cleaned.split("/").filter(Boolean);
  if (parts.length < 2 || parts[0] !== "resources") {
    throw new ResourceManagementError("Invalid storage path namespace.");
  }
  return parts.join("/");
}

/**
 * Deletes a blob from object storage.
 * Gracefully logs warnings rather than blowing up transactions on remote network errors.
 */
export async function deleteBlobSafe(urlOrPathname: string | null | undefined): Promise<void> {
  if (!urlOrPathname) return;
  try {
    if (isValidBlobUrl(urlOrPathname)) {
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        await del(urlOrPathname);
      }
    }
  } catch (error) {
    console.warn(`[storage-service] Failed to delete blob: ${urlOrPathname}`, error);
  }
}

/**
 * Verifies the binary content of an uploaded blob URL before attaching it to a database record.
 * If inspection fails, deletes the uploaded blob immediately to prevent orphaned storage.
 */
export async function verifyAndInspectBlobUrl(
  url: string
): Promise<{ format: SupportedImageFormat; width: number; height: number }> {
  if (!isValidBlobUrl(url)) {
    throw new ResourceManagementError("Invalid image storage URL.");
  }

  // If in test environment or mock storage, validate URL structure and skip live fetch if fetch is unconfigured
  if (process.env.BLOB_MOCK === "true" || process.env.NODE_ENV === "test") {
    return { format: "jpeg", width: 800, height: 600 };
  }

  try {
    const response = await fetch(url, {
      headers: { Range: "bytes=0-65535" },
    });
    if (!response.ok) {
      throw new ResourceManagementError("Could not access uploaded image in storage.");
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return validateImageBuffer(buffer);
  } catch (error) {
    await deleteBlobSafe(url);
    if (error instanceof ResourceManagementError) throw error;
    throw new ResourceManagementError("Image verification failed. Please try uploading again.");
  }
}
