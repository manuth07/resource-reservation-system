import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

// Reuse the TypeScript loader already used by Prisma, with the app's @/ alias.
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": fileURLToPath(new URL("../src", import.meta.url)),
    // Jiti does not propagate Node's react-server condition. This private Node
    // CLI selects that marker export explicitly; Next.js guards are unchanged.
    "server-only": fileURLToPath(new URL("../node_modules/server-only/empty.js", import.meta.url)),
  },
  debug: false,
});

try {
  await jiti.import("./bootstrap-admin.ts");
} catch {
  process.stderr.write("Bootstrap could not start. Check runtime dependencies and configuration; details are suppressed.\n");
  process.exitCode = 1;
}
