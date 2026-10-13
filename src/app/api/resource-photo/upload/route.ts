import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { UserRole, AccountStatus } from "@/generated/prisma/client";
import { requireRole } from "@/lib/authorization";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_FILE_SIZE,
  sanitizePathname,
} from "@/lib/storage-service";

export async function POST(request: Request): Promise<NextResponse> {
  // 1. Authorize: Admin role required
  let actor;
  try {
    actor = await requireRole(UserRole.ADMIN);
  } catch {
    return NextResponse.json(
      { error: "Authentication required with Administrator privileges." },
      { status: 401 }
    );
  }

  // 2. Security checks: account must be active and have finished mandatory password change
  if (actor.accountStatus !== AccountStatus.ACTIVE || actor.mustChangePassword) {
    return NextResponse.json(
      { error: "Forbidden: Account status not eligible for resource management." },
      { status: 403 }
    );
  }

  // 3. Rate limiting for token issuance
  try {
    await enforceRateLimit("photo-upload-token", actor.id, 30, 60_000);
  } catch {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please wait a moment before trying again." },
      { status: 429 }
    );
  }

  // 4. Ensure storage token is configured
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        error:
          "Vercel Blob storage is not configured. Set BLOB_READ_WRITE_TOKEN in environment variables.",
      },
      { status: 503 }
    );
  }

  // 5. Process upload token request
  try {
    const body = (await request.json()) as HandleUploadBody;
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Enforce resources/ namespace and block traversal
        const sanitized = sanitizePathname(pathname);
        return {
          allowedContentTypes: [...ALLOWED_IMAGE_MIME_TYPES],
          maximumSizeInBytes: MAX_IMAGE_FILE_SIZE,
          validUntil: Date.now() + 5 * 60 * 1000, // 5-minute TTL
          tokenPayload: JSON.stringify({ userId: actor.id, pathname: sanitized }),
        };
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload authorization failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
