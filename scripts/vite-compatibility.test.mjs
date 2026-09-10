// @vitest-environment node
import { Buffer } from "node:buffer";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import vm from "node:vm";
import { build, transformWithEsbuild } from "vite";
import { expect, it } from "vitest";

it("builds destructuring for Safari 14 while awaiting WASM initialization", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "hakawati-vite-"));
  try {
    const wasmPath = path.join(directory, "answer.wasm");
    // A tiny WebAssembly module exporting answer(): i32 = 42.
    await writeFile(
      wasmPath,
      Buffer.from([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 127, 3, 2, 1, 0, 7, 10,
        1, 6, 97, 110, 115, 119, 101, 114, 0, 0, 10, 6, 1, 4, 0, 65, 42, 11,
      ]),
    );
    const result = await build({
      configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
      logLevel: "silent",
      plugins: [
        {
          name: "compatibility-fixture",
          resolveId(id) {
            if (id === "virtual:compatibility") return id;
            if (id === "virtual:answer.wasm") return wasmPath;
          },
          load(id) {
            if (id !== "virtual:compatibility") return null;
            return `
              import { answer } from "virtual:answer.wasm";
              const { nested: [offset] } = await Promise.resolve({ nested: [2] });
              const [first, ...rest] = new Set([1, 2, 3]);
              const count = ({ value, ...other }, [extra] = [0]) =>
                value + Object.keys(other).length + extra;
              const pairs = [];
              for (const [key, value] of new Map([["x", 4]])) pairs.push(key + value);
              export const result = {
                answer: answer() + offset,
                items: [first, ...rest],
                count: count({ value: 3, key: 4 }, [5]),
                pairs,
              };
            `;
          },
        },
      ],
      build: {
        write: false,
        rollupOptions: {
          input: "virtual:compatibility",
          preserveEntrySignatures: "strict",
        },
      },
    });
    const entry = result.output.find(
      (item) => item.type === "chunk" && item.isEntry,
    );
    expect(entry).toBeDefined();
    // Execute the generated module in Node after converting only its ESM exports.
    // A call to answer() before the TLA/WASM promise resolves fails this test.
    const { code } = await transformWithEsbuild(entry.code, "fixture.js", {
      format: "cjs",
      target: "node20",
    });
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, Buffer });
    await module.exports.__tla;
    expect(module.exports.result).toEqual({
      answer: 44,
      items: [1, 2, 3],
      count: 9,
      pairs: ["x4"],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
