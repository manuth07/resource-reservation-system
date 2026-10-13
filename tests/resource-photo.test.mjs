import assert from "node:assert/strict";
import test from "node:test";
import { loadSource } from "./helpers/source.mjs";
import {
  resourceEnums,
  resourceFixture,
  resourceId,
  timestamp,
  resourceValidation,
} from "./helpers/resources.mjs";

// Load storage utils and service
const storageUtils = loadSource("src/lib/storage-utils.ts", {});
const storageService = loadSource("src/lib/storage-service.ts", {
  "@vercel/blob": { del: async () => {} },
  "@/lib/resource-validation": resourceValidation,
  "@/lib/storage-utils": storageUtils,
});

// Helper to generate synthetic image buffers
function makePng(width, height) {
  const buf = Buffer.alloc(24);
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); // PNG signature
  buf.writeUInt32BE(13, 8); // IHDR length
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function makeJpeg(width, height) {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]), // SOI
    Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]), // APP0
    Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08]), // SOF0
    Buffer.from([
      (height >> 8) & 0xff, height & 0xff,
      (width >> 8) & 0xff, width & 0xff,
      0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01
    ]),
  ]);
}

function makeWebpVP8X(width, height) {
  const buf = Buffer.alloc(30);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(22, 4);
  buf.write("WEBPVP8X", 8, "ascii");
  buf.writeUInt32LE(10, 16); // chunk size
  buf.set([0x00, 0x00, 0x00, 0x00], 20); // flags
  // 24-bit width - 1 and height - 1 (little-endian)
  const w = width - 1;
  const h = height - 1;
  buf[24] = w & 0xff;
  buf[25] = (w >> 8) & 0xff;
  buf[26] = (w >> 16) & 0xff;
  buf[27] = h & 0xff;
  buf[28] = (h >> 8) & 0xff;
  buf[29] = (h >> 16) & 0xff;
  return buf;
}

test("storage service: detects format and extracts dimensions for PNG, JPEG, and WebP", () => {
  const png = makePng(640, 480);
  const pngResult = storageService.validateImageBuffer(png);
  assert.equal(pngResult.format, "png");
  assert.equal(pngResult.width, 640);
  assert.equal(pngResult.height, 480);

  const jpeg = makeJpeg(1920, 1080);
  const jpegResult = storageService.validateImageBuffer(jpeg);
  assert.equal(jpegResult.format, "jpeg");
  assert.equal(jpegResult.width, 1920);
  assert.equal(jpegResult.height, 1080);

  const webp = makeWebpVP8X(800, 600);
  const webpResult = storageService.validateImageBuffer(webp);
  assert.equal(webpResult.format, "webp");
  assert.equal(webpResult.width, 800);
  assert.equal(webpResult.height, 600);
});

test("storage service: rejects disguised executables and non-image files", () => {
  const exeBuffer = Buffer.from("MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff");
  assert.throws(() => storageService.validateImageBuffer(exeBuffer), (err) => {
    return err.message.includes("Invalid image format");
  });

  const textBuffer = Buffer.from("<html><script>alert(1)</script></html>");
  assert.throws(() => storageService.validateImageBuffer(textBuffer), (err) => {
    return err.message.includes("Invalid image format");
  });
});

test("storage service: mitigates decompression bombs and undersized images", () => {
  // Dimension exceeds MAX_IMAGE_DIMENSION (4096)
  const bombPng = makePng(10000, 10000);
  assert.throws(() => storageService.validateImageBuffer(bombPng), (err) => {
    return err.message.includes("exceed the maximum limit of 4096×4096");
  });

  // Dimension smaller than MIN_IMAGE_DIMENSION (10)
  const tinyJpeg = makeJpeg(4, 4);
  assert.throws(() => storageService.validateImageBuffer(tinyJpeg), (err) => {
    return err.message.includes("too small");
  });

  // File size exceeding 3 MB
  const oversizedBuf = Buffer.alloc(3 * 1024 * 1024 + 1);
  assert.throws(() => storageService.validateImageBuffer(oversizedBuf), (err) => {
    return err.message.includes("exceeds the 3 MB limit");
  });
});

test("storage service: validates blob URL host and namespace sanitization", () => {
  assert.equal(
    storageService.isValidBlobUrl("https://abc.public.blob.vercel-storage.com/resources/123/photo.jpg"),
    true
  );
  assert.equal(
    storageService.isValidBlobUrl("https://blob.mock-storage.local/resources/123/photo.jpg"),
    true
  );

  // Rejects insecure HTTP
  assert.equal(
    storageService.isValidBlobUrl("http://abc.public.blob.vercel-storage.com/resources/123/photo.jpg"),
    false
  );

  // Rejects untrusted domains
  assert.equal(
    storageService.isValidBlobUrl("https://evil-attacker.com/resources/123/photo.jpg"),
    false
  );

  // Rejects outside resources namespace
  assert.equal(
    storageService.isValidBlobUrl("https://abc.public.blob.vercel-storage.com/passwords/dump.txt"),
    false
  );

  // Namespace sanitization prevents path traversal
  assert.equal(
    storageService.sanitizePathname("resources/drafts/photo.png"),
    "resources/drafts/photo.png"
  );
  assert.throws(() => {
    storageService.sanitizePathname("users/admin/avatar.png");
  }, /Invalid storage path namespace/);
});

test("storage utils: isTrustedBlobUrl accurately identifies trusted Vercel Blob domains", () => {
  assert.equal(
    storageUtils.isTrustedBlobUrl("https://abc.public.blob.vercel-storage.com/resources/photo.webp"),
    true
  );
  assert.equal(
    storageUtils.isTrustedBlobUrl("https://blob.mock-storage.local/resources/photo.png"),
    true
  );
  // Rejects insecure HTTP
  assert.equal(
    storageUtils.isTrustedBlobUrl("http://abc.public.blob.vercel-storage.com/resources/photo.jpg"),
    false
  );
  // Rejects untrusted domains
  assert.equal(
    storageUtils.isTrustedBlobUrl("https://untrusted-storage.com/resources/photo.jpg"),
    false
  );
  // Handles falsy/malformed input
  assert.equal(storageUtils.isTrustedBlobUrl(null), false);
  assert.equal(storageUtils.isTrustedBlobUrl(""), false);
  assert.equal(storageUtils.isTrustedBlobUrl("not-a-url"), false);
});

test("upload API route: enforces Admin authentication and account eligibility", async () => {
  const routeModule = (actor, tokenConfigured = true) => {
    return loadSource("src/app/api/resource-photo/upload/route.ts", {
      "next/server": {
        NextResponse: {
          json: (body, init) => ({ status: init?.status ?? 200, body }),
        },
      },
      "@vercel/blob/client": {
        handleUpload: async () => ({ clientToken: "signed-token" }),
      },
      "@/generated/prisma/client": resourceEnums,
      "@/lib/authorization": {
        requireRole: async () => {
          if (!actor) throw new Error("Unauthorized");
          return actor;
        },
      },
      "@/lib/rate-limit": { enforceRateLimit: async () => {} },
      "@/lib/storage-service": storageService,
    }, {
      BLOB_READ_WRITE_TOKEN: tokenConfigured ? "vercel_blob_rw_test" : "",
    });
  };

  // 1. Unauthenticated -> 401
  const unauthRoute = routeModule(null);
  const unauthRes = await unauthRoute.POST(new Request("https://localhost/api/resource-photo/upload", {
    method: "POST",
    body: JSON.stringify({ type: "blob.generate-client-token", payload: { pathname: "resources/test.jpg" } }),
  }));
  assert.equal(unauthRes.status, 401);

  // 2. Active Employee -> 403
  const employeeRoute = routeModule({ id: "emp-1", role: "EMPLOYEE", accountStatus: "ACTIVE", mustChangePassword: false });
  // requireRole in authorization throws on non-admin
  const empRouteMock = loadSource("src/app/api/resource-photo/upload/route.ts", {
    "next/server": { NextResponse: { json: (body, init) => ({ status: init?.status ?? 200, body }) } },
    "@vercel/blob/client": { handleUpload: async () => ({ clientToken: "signed-token" }) },
    "@/generated/prisma/client": resourceEnums,
    "@/lib/authorization": {
      requireRole: async () => { throw new Error("Forbidden role"); },
    },
    "@/lib/rate-limit": { enforceRateLimit: async () => {} },
    "@/lib/storage-service": storageService,
  }, { BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_test" });
  const empRes = await empRouteMock.POST(new Request("https://localhost/api/resource-photo/upload", {
    method: "POST",
    body: JSON.stringify({ type: "blob.generate-client-token", payload: { pathname: "resources/test.jpg" } }),
  }));
  assert.equal(empRes.status, 401);

  // 3. Admin needing password change -> 403
  const mustChangeAdmin = routeModule({ id: "admin-1", role: "ADMIN", accountStatus: "ACTIVE", mustChangePassword: true });
  const pwdRes = await mustChangeAdmin.POST(new Request("https://localhost/api/resource-photo/upload", {
    method: "POST",
    body: JSON.stringify({ type: "blob.generate-client-token", payload: { pathname: "resources/test.jpg" } }),
  }));
  assert.equal(pwdRes.status, 403);

  // 4. Inactive Admin -> 403
  const inactiveAdmin = routeModule({ id: "admin-1", role: "ADMIN", accountStatus: "INACTIVE", mustChangePassword: false });
  const inactiveRes = await inactiveAdmin.POST(new Request("https://localhost/api/resource-photo/upload", {
    method: "POST",
    body: JSON.stringify({ type: "blob.generate-client-token", payload: { pathname: "resources/test.jpg" } }),
  }));
  assert.equal(inactiveRes.status, 403);

  // 5. Active Admin with missing token -> 503
  const noTokenAdmin = routeModule({ id: "admin-1", role: "ADMIN", accountStatus: "ACTIVE", mustChangePassword: false }, false);
  const noTokenRes = await noTokenAdmin.POST(new Request("https://localhost/api/resource-photo/upload", {
    method: "POST",
    body: JSON.stringify({ type: "blob.generate-client-token", payload: { pathname: "resources/test.jpg" } }),
  }));
  assert.equal(noTokenRes.status, 503);
  assert.match(noTokenRes.body.error, /Vercel Blob storage is not configured/);

  // 6. Active Admin with configured token -> 200
  const validAdmin = routeModule({ id: "admin-1", role: "ADMIN", accountStatus: "ACTIVE", mustChangePassword: false }, true);
  const validRes = await validAdmin.POST(new Request("https://localhost/api/resource-photo/upload", {
    method: "POST",
    body: JSON.stringify({ type: "blob.generate-client-token", payload: { pathname: "resources/test.jpg" } }),
  }));
  assert.equal(validRes.status, 200);
});

test("resource service: attaches photo, safely cleans old blob on replacement, and handles deletion", async () => {
  const deletedBlobs = [];
  const mockStorage = {
    deleteBlobSafe: async (url) => { deletedBlobs.push(url); },
    verifyAndInspectBlobUrl: async (url) => {
      if (url.includes("corrupted")) throw new Error("Image verification failed");
      return { format: "jpeg", width: 800, height: 600 };
    },
  };

  const fixture = resourceFixture({
    resource: {
      imageUrl: "https://abc.public.blob.vercel-storage.com/resources/old-photo.jpg",
      imagePath: "resources/old-photo.jpg",
    },
  });

  const service = loadSource("src/lib/resource-service.ts", {
    "@/generated/prisma/client": resourceEnums,
    "@/lib/authorization": fixture.authorization,
    "@/lib/prisma": { prisma: fixture.client },
    "@/lib/rate-limit": { enforceRateLimit: async () => {} },
    "@/lib/resource-validation": resourceValidation,
    "@/lib/storage-service": mockStorage,
  });

  // 1. Initial resource has old photo
  const initial = await service.getResource(resourceId);
  assert.equal(initial.imageUrl, "https://abc.public.blob.vercel-storage.com/resources/old-photo.jpg");

  // 2. Replace photo with new one
  const newUrl = "https://abc.public.blob.vercel-storage.com/resources/new-photo.jpg";
  const newPath = "resources/new-photo.jpg";
  await service.attachResourcePhoto(resourceId, newUrl, newPath, timestamp);

  const updated = await service.getResource(resourceId);
  assert.equal(updated.imageUrl, newUrl);
  assert.equal(updated.imagePath, newPath);

  // Old blob was deleted post-commit
  assert.equal(deletedBlobs.length, 1);
  assert.equal(deletedBlobs[0], "https://abc.public.blob.vercel-storage.com/resources/old-photo.jpg");

  // 3. Remove photo
  const currentTimestamp = updated.updatedAt;
  await service.removeResourcePhoto(resourceId, currentTimestamp);

  const cleared = await service.getResource(resourceId);
  assert.equal(cleared.imageUrl, null);
  assert.equal(cleared.imagePath, null);

  // New photo blob was deleted on removal
  assert.equal(deletedBlobs.length, 2);
  assert.equal(deletedBlobs[1], newUrl);
});

test("resource service: optimistic concurrency prevents stale updates and retains existing photo", async () => {
  const deletedBlobs = [];
  const mockStorage = {
    deleteBlobSafe: async (url) => { deletedBlobs.push(url); },
    verifyAndInspectBlobUrl: async () => ({ format: "jpeg", width: 800, height: 600 }),
  };

  const fixture = resourceFixture({
    resource: {
      imageUrl: "https://abc.public.blob.vercel-storage.com/resources/current.jpg",
      imagePath: "resources/current.jpg",
    },
  });

  const service = loadSource("src/lib/resource-service.ts", {
    "@/generated/prisma/client": resourceEnums,
    "@/lib/authorization": fixture.authorization,
    "@/lib/prisma": { prisma: fixture.client },
    "@/lib/rate-limit": { enforceRateLimit: async () => {} },
    "@/lib/resource-validation": resourceValidation,
    "@/lib/storage-service": mockStorage,
  });

  // Call with stale timestamp
  const staleTimestamp = "2020-01-01T00:00:00.000Z";
  await assert.rejects(
    service.attachResourcePhoto(resourceId, "https://abc.public.blob.vercel-storage.com/resources/stale.jpg", "resources/stale.jpg", staleTimestamp),
    /changed by another administrator/
  );

  // Database record and storage blob remain untouched
  const current = await service.getResource(resourceId);
  assert.equal(current.imageUrl, "https://abc.public.blob.vercel-storage.com/resources/current.jpg");
  assert.equal(deletedBlobs.length, 0);
});
