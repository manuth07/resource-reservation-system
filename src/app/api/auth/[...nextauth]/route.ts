import { handlers } from "@/auth";

// Cache Components requires the default Node.js runtime; segment runtime config
// is unsupported in the installed Next.js version. Do not deploy this on Edge.
export const { GET, POST } = handlers;
