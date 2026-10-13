import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";

export function loadSource(path, mocks, env = { AUTH_SECRET: "test-only-secret-with-at-least-32-characters", NODE_ENV: "test" }, globals = {}) {
  const { outputText } = ts.transpileModule(readFileSync(resolve(path), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    require(name) {
      if (name === "server-only") return {};
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === "next/image") return function MockImage(props) { return { type: "img", props }; };
      if (name === "@vercel/blob") return { del: async () => {}, head: async () => ({}) };
      if (name === "@vercel/blob/client") return { upload: async () => ({ url: "https://blob.mock-storage.local/resources/test.jpg", pathname: "resources/test.jpg" }), handleUpload: async () => ({}) };
      if (name === "@/lib/storage-utils") return { isTrustedBlobUrl: (url) => typeof url === "string" && url.length > 0 };
      throw new Error(`Unexpected dependency: ${name}`);
    },
    process: { env }, Buffer, console, URL, AbortSignal, Request, Headers, Response,
    fetch: globalThis.fetch, ...globals,
  }, { filename: path });
  return exports;
}
