import { randomUUID } from "node:crypto";
import { loadSource } from "./source.mjs";
import * as React from "react";

export const resourceEnums = loadSource("src/generated/prisma/enums.ts", {});
export const resourceValidation = loadSource("src/lib/resource-validation.ts", {});
export const categoryId = "e8ac166d-b621-4563-aeb7-58824d4f7355";
export const resourceId = "e38057be-a51e-4690-995d-9ae949f76bb4";
export const resourceAdminId = "dc19ef15-b709-4a69-8e1e-93e11ee3b0c7";
export const timestamp = "2026-10-12T00:00:00.000Z";
export const categoryInput = { code: "MEETING_ROOM", name: "Meeting rooms", description: "Internal rooms", isVehicle: false };
export const resourceInput = { resourceCode: "ROOM_001", name: "Conference room", categoryId, capacity: "12", location: "Floor 2", requiresApproval: false, isActive: true };

export const storageServiceMock = {
  deleteBlobSafe: async () => {},
  verifyAndInspectBlobUrl: async () => ({ format: "jpeg", width: 800, height: 600 }),
};

export function resourceServiceFor(prisma, authorization, rateLimit = async () => {}, storage = storageServiceMock) {
  return loadSource("src/lib/resource-service.ts", {
    "@/generated/prisma/client": resourceEnums,
    "@/lib/authorization": authorization,
    "@/lib/prisma": { prisma },
    "@/lib/rate-limit": { enforceRateLimit: rateLimit },
    "@/lib/resource-validation": resourceValidation,
    "@/lib/storage-service": storage,
  });
}
export function resourceFixture(options = {}) {
  let state = {
    users: [{ id: resourceAdminId, role: "ADMIN", accountStatus: "ACTIVE", mustChangePassword: false, sessionVersion: 0, ...options.actor }],
    categories: [{ id: categoryId, ...categoryInput, metadata: { retained: true }, updatedAt: new Date(timestamp), ...options.category }, ...(options.categories ?? [])],
    resources: options.empty ? [] : [{ id: resourceId, ...resourceInput, capacity: 12, updatedAt: new Date(timestamp), ...options.resource }, ...(options.resources ?? [])],
    reservations: options.reservations ?? [],
  };
  let session = options.unauthenticated ? null : { user: { id: resourceAdminId, sessionVersion: 0 } };
  let queue = Promise.resolve();
  let limited = false;
  const trace = [];
  function select(row, fields, db) {
    if (!row) return null;
    if (!fields) return { ...row };
    return Object.fromEntries(Object.entries(fields).map(([key, value]) => {
      if (key === "category") return [key, select(db.categories.find((c) => c.id === row.categoryId), value.select, db)];
      if (key === "_count") return [key, { resources: db.resources.filter((r) => r.categoryId === row.id).length, reservations: db.reservations.filter((r) => r.requestedCategoryId === row.id).length }];
      return [key, row[key]];
    }));
  }
  function matches(row, where = {}) {
    return Object.entries(where).every(([key, value]) => {
      if (key === "OR") return value.some((condition) => matches(row, condition));
      if (value && typeof value === "object" && "contains" in value) {
        const literal = value.contains.replace(/\\([\\%_])/g, "$1").toLowerCase();
        return row[key].toLowerCase().includes(literal);
      }
      return row[key] === value;
    });
  }
  function operations(db) {
    const model = (table) => ({
      findUnique: async ({ where, select: fields }) => select(db[table].find((r) => r.id === where.id), fields, db),
      findMany: async ({ where, select: fields, skip = 0, take = Infinity }) => db[table].filter((r) => matches(r, where)).sort((a, b) => a.name.localeCompare(b.name)).slice(skip, skip + take).map((r) => select(r, fields, db)),
      count: async ({ where } = {}) => db[table].filter((r) => matches(r, where)).length,
      create: async ({ data }) => {
        if (options.failWrite) throw { code: options.failWrite };
        const row = { id: randomUUID(), updatedAt: new Date(timestamp), ...data }; db[table].push(row); return { id: row.id };
      },
      update: async ({ where, data }) => {
        if (options.failWrite) throw { code: options.failWrite };
        const row = db[table].find((r) => r.id === where.id);
        Object.assign(row, data, { updatedAt: new Date(row.updatedAt.getTime() + 1) });
        return { ...row };
      },
    });
    return { user: model("users"), resourceCategory: model("categories"), resource: model("resources"), reservation: model("reservations") };
  }
  const client = {
    get user() { return operations(state).user; },
    get resourceCategory() { return operations(state).resourceCategory; },
    get resource() { return operations(state).resource; },
    get reservation() { return operations(state).reservation; },
    $transaction(arg) {
      if (Array.isArray(arg)) return Promise.all(arg);
      const operation = queue.then(async () => {
        options.beforeTransaction?.(state);
        const snapshot = structuredClone(state);
        const tx = {
          ...operations(snapshot),
          $executeRaw: async (strings) => { trace.push(strings.join("?")); return 1; },
          $queryRaw: async (strings, ...values) => {
            const sql = strings.join("?"); trace.push(sql);
            if (sql.includes('upper(btrim("resourceCode"))')) return snapshot.resources.filter((r) => r.resourceCode.trim().toUpperCase() === values[0] && r.id !== values[1]).slice(0, 1);
            if (sql.includes('upper(btrim("code"))')) return snapshot.categories.filter((r) => (r.code.trim().toUpperCase() === values[0] || r.name.trim().toLowerCase() === values[1].toLowerCase()) && r.id !== values[2]).slice(0, 1);
            return [];
          },
        };
        const result = await arg(tx); state = snapshot; return result;
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
  const authorization = loadSource("src/lib/authorization.ts", { react: React, "@/auth": { auth: async () => session }, "@/generated/prisma/enums": resourceEnums, "@/lib/prisma": { prisma: client } });
  const service = resourceServiceFor(client, authorization, async () => { if (limited) throw new Error("Rate limited"); });
  return { service, client, authorization, trace, state: () => state, session: (value) => { session = value; }, limit: () => { limited = true; } };
}
