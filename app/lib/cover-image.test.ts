import { Blob as NodeBlob } from "node:buffer";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let optimizeCoverImage: typeof import("./cover-image").optimizeCoverImage;
let sha256Hex: typeof import("./cover-image").sha256Hex;
let detectCoverImageContentType: typeof import("./cover-image").detectCoverImageContentType;
let width: number;
let height: number;
let bitmapClose: ReturnType<typeof vi.fn>;
let decode: ReturnType<typeof vi.fn>;
let drawImage: ReturnType<typeof vi.fn>;
let encode: ReturnType<typeof vi.fn>;
let canvas: HTMLCanvasElement;
let context: CanvasRenderingContext2D;

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("Blob", NodeBlob);
  vi.stubGlobal("crypto", webcrypto);
  width = 640;
  height = 480;
  bitmapClose = vi.fn();
  decode = vi.fn(async () => ({ width, height, close: bitmapClose }));
  vi.stubGlobal("createImageBitmap", decode);
  drawImage = vi.fn();
  context = { drawImage } as unknown as CanvasRenderingContext2D;
  encode = vi.fn((callback: BlobCallback) => {
    callback(new Blob([new Uint8Array(20)], { type: "image/webp" }));
  });
  canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toBlob: encode,
  } as unknown as HTMLCanvasElement;
  vi.spyOn(document, "createElement").mockReturnValue(canvas);
  ({ optimizeCoverImage, sha256Hex, detectCoverImageContentType } =
    await import("./cover-image"));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("cover optimization", () => {
  it("identifies supported stored covers from bytes without accepting other formats", () => {
    expect(detectCoverImageContentType(png())).toBe("image/png");
    expect(detectCoverImageContentType(jpeg(640, 480))).toBe("image/jpeg");
    expect(detectCoverImageContentType(webp(640, 480))).toBe("image/webp");
    expect(
      detectCoverImageContentType(new TextEncoder().encode("GIF89a")),
    ).toBeUndefined();
    expect(
      detectCoverImageContentType(new TextEncoder().encode("RIFFother-data")),
    ).toBeUndefined();
    expect(detectCoverImageContentType(new Uint8Array())).toBeUndefined();
  });

  it("resizes the longest side to 1280, keeps aspect ratio and alpha, and releases the bitmap", async () => {
    width = 3000;
    height = 2000;
    const result = await optimizeCoverImage({
      bytes: png(width, height),
      contentType: "image/png",
    });

    expect(result).toMatchObject({
      width: 1280,
      height: 853,
      contentType: "image/webp",
    });
    expect(decode).toHaveBeenCalledWith(expect.any(Blob), {
      imageOrientation: "from-image",
    });
    expect(canvas.getContext).toHaveBeenCalledWith("2d", { alpha: true });
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1280, 853);
    expect(context.imageSmoothingQuality).toBe("high");
    expect(encode).toHaveBeenCalledWith(
      expect.any(Function),
      "image/webp",
      0.82,
    );
    expect(bitmapClose).toHaveBeenCalledOnce();
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });

  it("does not upscale and keeps the original when encoding is not smaller", async () => {
    const bytes = png();
    encode.mockImplementation((callback: BlobCallback) =>
      callback(
        new Blob([new Uint8Array(bytes.length)], { type: "image/webp" }),
      ),
    );
    const result = await optimizeCoverImage({
      bytes,
      contentType: "image/png",
    });
    expect(result).toEqual({
      bytes,
      width: 640,
      height: 480,
      contentType: "image/png",
    });
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 640, 480);
  });

  it("uses oriented dimensions for encoded JPEGs and raw dimensions when retaining their bytes", async () => {
    width = 2000;
    height = 3000;
    const result = await optimizeCoverImage({
      bytes: jpeg(3000, 2000),
      contentType: "image/jpeg",
    });
    expect(result).toMatchObject({
      width: 853,
      height: 1280,
      contentType: "image/webp",
    });

    width = 480;
    height = 640;
    encode.mockImplementation((callback: BlobCallback) =>
      callback(new Blob([new Uint8Array(1024)], { type: "image/webp" })),
    );
    const original = jpeg(640, 480);
    expect(
      await optimizeCoverImage({ bytes: original, contentType: "image/jpeg" }),
    ).toEqual({
      bytes: original,
      width: 640,
      height: 480,
      contentType: "image/jpeg",
    });
  });

  it.each(["png", "webp"])(
    "preserves animated %s bytes without flattening or resizing",
    async (kind) => {
      width = 2400;
      height = 1600;
      const bytes =
        kind === "png" ? png(width, height, true) : webp(width, height, true);
      const contentType = `image/${kind}`;
      const result = await optimizeCoverImage({ bytes, contentType });
      expect(result).toEqual({ bytes, contentType, width, height });
      expect(decode).toHaveBeenCalledOnce();
      expect(drawImage).not.toHaveBeenCalled();
      expect(bitmapClose).toHaveBeenCalledOnce();
    },
  );

  it("does not treat animation marker text inside metadata as animation", async () => {
    const bytes = png(640, 480, false, "acTL ANIM fcTL");
    expect(
      await optimizeCoverImage({ bytes, contentType: "image/png" }),
    ).toMatchObject({ contentType: "image/webp" });
    expect(drawImage).toHaveBeenCalledOnce();
  });

  it("uses the actual PNG MIME when WebP encoding falls back during resizing", async () => {
    width = 1600;
    encode.mockImplementation((callback: BlobCallback) =>
      callback(new Blob([new Uint8Array(30)], { type: "image/png" })),
    );
    const result = await optimizeCoverImage({
      bytes: png(width, height),
      contentType: "image/png",
    });
    expect(result).toMatchObject({
      contentType: "image/png",
      width: 1280,
      height: 384,
    });
    expect(encode).toHaveBeenCalledOnce();
  });

  it("retains a small original when the browser has no WebP encoder", async () => {
    const bytes = jpeg(640, 480);
    encode.mockImplementation((callback: BlobCallback) =>
      callback(new Blob([new Uint8Array(1)], { type: "image/png" })),
    );
    expect(
      await optimizeCoverImage({ bytes, contentType: "image/jpeg" }),
    ).toEqual({ bytes, width, height, contentType: "image/jpeg" });
  });

  it("tries PNG after failed WebP encoding and rejects a failed resize", async () => {
    width = 1600;
    encode.mockImplementation((callback: BlobCallback) => callback(null));
    await expect(
      optimizeCoverImage({
        bytes: png(width, height),
        contentType: "image/png",
      }),
    ).rejects.toThrow("Could not resize");
    expect(encode.mock.calls.map((call) => call[1])).toEqual([
      "image/webp",
      "image/png",
    ]);
    expect(bitmapClose).toHaveBeenCalledOnce();
    expect(canvas.width).toBe(0);
  });

  it("rejects unsupported, mismatched, oversized and excessive-pixel sources before decode", async () => {
    await expect(
      optimizeCoverImage({ bytes: png(), contentType: "image/gif" }),
    ).rejects.toThrow("JPEG, PNG, or WebP");
    await expect(
      optimizeCoverImage({ bytes: png(), contentType: "image/jpeg" }),
    ).rejects.toThrow("does not match");
    await expect(
      optimizeCoverImage({
        bytes: new Uint8Array(20 * 1024 * 1024 + 1),
        contentType: "image/png",
      }),
    ).rejects.toThrow("20 MiB");
    await expect(
      optimizeCoverImage({
        bytes: png(10000, 10000),
        contentType: "image/png",
      }),
    ).rejects.toThrow("40 megapixels");
    await expect(
      optimizeCoverImage({ bytes: new Uint8Array(), contentType: "image/png" }),
    ).rejects.toThrow("nonempty");
    expect(decode).not.toHaveBeenCalled();
  });

  it("rejects malformed chunk lengths rather than reading outside the file", async () => {
    const bytes = png();
    new DataView(bytes.buffer).setUint32(33, 0x7fffffff);
    await expect(
      optimizeCoverImage({ bytes, contentType: "image/png" }),
    ).rejects.toThrow("invalid");
    expect(decode).not.toHaveBeenCalled();
  });

  it("does not cache decode failures", async () => {
    decode.mockRejectedValueOnce(new Error("bad image"));
    const input = { bytes: png(), contentType: "image/png" };
    await expect(optimizeCoverImage(input)).rejects.toThrow("Could not read");
    await expect(optimizeCoverImage(input)).resolves.toMatchObject({
      contentType: "image/webp",
    });
    expect(decode).toHaveBeenCalledTimes(2);
  });

  it("reuses concurrent and repeated content while protecting cached bytes from callers", async () => {
    const input = { bytes: png(), contentType: "image/png" };
    const [first, second] = await Promise.all([
      optimizeCoverImage(input),
      optimizeCoverImage(input),
    ]);
    first.bytes.fill(255);
    expect(second.bytes[0]).toBe(0);
    const third = await optimizeCoverImage(input);
    expect(third.bytes[0]).toBe(0);
    expect(decode).toHaveBeenCalledOnce();
    expect(encode).toHaveBeenCalledOnce();
  });

  it("evicts least-recently-used results after eight distinct covers", async () => {
    const inputs = Array.from({ length: 9 }, (_, index) => ({
      bytes: png(640, 480, false, String(index)),
      contentType: "image/png",
    }));
    for (const input of inputs.slice(0, 8)) await optimizeCoverImage(input);
    await optimizeCoverImage(inputs[0]);
    await optimizeCoverImage(inputs[8]);
    await optimizeCoverImage(inputs[0]);
    expect(decode).toHaveBeenCalledTimes(9);
    await optimizeCoverImage(inputs[1]);
    expect(decode).toHaveBeenCalledTimes(10);
  });

  it("bounds retained results to 16 MiB even below the entry limit", async () => {
    encode.mockImplementation((callback: BlobCallback) => callback(null));
    const inputs = Array.from({ length: 3 }, (_, index) => {
      const bytes = new Uint8Array(6 * 1024 * 1024);
      bytes.set(png(640, 480, false, String(index)));
      return { bytes, contentType: "image/png" };
    });
    for (const input of inputs) await optimizeCoverImage(input);
    await optimizeCoverImage(inputs[0]);
    expect(decode).toHaveBeenCalledTimes(4);
  });

  it("caches a small result even when its source exceeds the cache byte budget", async () => {
    const bytes = new Uint8Array(17 * 1024 * 1024);
    bytes.set(png());
    const input = { bytes, contentType: "image/png" };
    expect((await optimizeCoverImage(input)).bytes.length).toBe(20);
    expect((await optimizeCoverImage(input)).bytes.length).toBe(20);
    expect(decode).toHaveBeenCalledOnce();
    expect(encode).toHaveBeenCalledOnce();
  });

  it("uses and cleans up an Image URL when ImageBitmap is unavailable", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:cover"),
      revokeObjectURL,
    });
    class FallbackImage {
      naturalWidth = 640;
      naturalHeight = 480;
      onload?: () => void;
      onerror?: () => void;
      set src(value: string) {
        if (value) queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", FallbackImage);
    await expect(
      optimizeCoverImage({ bytes: png(), contentType: "image/png" }),
    ).resolves.toMatchObject({
      contentType: "image/webp",
      width: 640,
      height: 480,
    });
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:cover");
  });

  it("hashes exactly the supplied byte view", async () => {
    const bytes = new TextEncoder().encode("xabcx").subarray(1, 4);
    expect(await sha256Hex(bytes)).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

function join(...parts: Uint8Array[]) {
  const result = new Uint8Array(
    parts.reduce((sum, part) => sum + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function png(width = 640, height = 480, animated = false, metadata = "cover") {
  const chunk = (name: string, data: Uint8Array) => {
    const result = new Uint8Array(data.length + 12);
    new DataView(result.buffer).setUint32(0, data.length);
    result.set(new TextEncoder().encode(name), 4);
    result.set(data, 8);
    return result;
  };
  const dimensions = new Uint8Array(13);
  const view = new DataView(dimensions.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  return join(
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", dimensions),
    ...(animated ? [chunk("acTL", new Uint8Array(8))] : []),
    chunk("tEXt", new TextEncoder().encode(metadata)),
    chunk("IEND", new Uint8Array()),
  );
}

function jpeg(width: number, height: number) {
  const result = new Uint8Array(40);
  result.set([0xff, 0xd8, 0xff, 0xc0, 0, 8, 8]);
  const view = new DataView(result.buffer);
  view.setUint16(7, height);
  view.setUint16(9, width);
  return result;
}

function webp(width: number, height: number, animated = false) {
  const result = new Uint8Array(30);
  result.set(new TextEncoder().encode("RIFF"));
  const view = new DataView(result.buffer);
  view.setUint32(4, 22, true);
  result.set(new TextEncoder().encode("WEBPVP8X"), 8);
  view.setUint32(16, 10, true);
  result[20] = animated ? 2 : 0;
  for (let index = 0; index < 3; index++) {
    result[24 + index] = ((width - 1) >>> (8 * index)) & 255;
    result[27 + index] = ((height - 1) >>> (8 * index)) & 255;
  }
  return result;
}
