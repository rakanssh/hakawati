// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { URL } from "node:url";
import { describe, expect, it } from "vitest";

const ICON_DIRS = [
  "../src-tauri/icons/ios/",
  "../src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset/",
];

function pngChunks(bytes) {
  const types = [];
  for (let offset = 8; offset < bytes.length; ) {
    const length = bytes.readUInt32BE(offset);
    types.push(bytes.toString("latin1", offset + 4, offset + 8));
    offset += 12 + length;
  }
  return types;
}

describe("iOS app icons", () => {
  // App Store Connect refuses an app whose icons have an alpha channel.
  it("have no alpha channel", () => {
    for (const dir of ICON_DIRS) {
      const url = new URL(dir, import.meta.url);
      const icons = readdirSync(url).filter((name) => name.endsWith(".png"));
      expect(icons.length, dir).toBeGreaterThan(0);
      for (const name of icons) {
        const bytes = readFileSync(new URL(name, url));
        const colorType = bytes[25];
        expect([4, 6], `${dir}${name}`).not.toContain(colorType);
        expect(pngChunks(bytes), `${dir}${name}`).not.toContain("tRNS");
      }
    }
  });
});
