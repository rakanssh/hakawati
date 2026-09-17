export type OptimizedCoverImage = {
  bytes: Uint8Array;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
};

type ImageInfo = Pick<OptimizedCoverImage, "width" | "height"> & {
  animated: boolean;
};

const MAX_SIDE = 1280;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 40_000_000;
const MAX_CACHE_BYTES = 16 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 8;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const cache = new Map<
  string,
  { promise: Promise<OptimizedCoverImage>; bytes: number }
>();

// Stored thumbnails retain bytes, not their original file's MIME type. This
// identifies the format only; optimizeCoverImage still validates and decodes it.
export function detectCoverImageContentType(
  bytes: Uint8Array,
): OptimizedCoverImage["contentType"] | undefined {
  if (PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    return "image/png";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return undefined;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function optimizeCoverImage(input: {
  bytes: Uint8Array;
  contentType: string;
}): Promise<OptimizedCoverImage> {
  const contentType = input.contentType.toLowerCase();
  if (
    contentType !== "image/jpeg" &&
    contentType !== "image/png" &&
    contentType !== "image/webp"
  ) {
    throw new Error("Cover images must be JPEG, PNG, or WebP.");
  }
  if (
    input.bytes.byteLength === 0 ||
    input.bytes.byteLength > MAX_SOURCE_BYTES
  ) {
    throw new Error("Cover images must be nonempty and no larger than 20 MiB.");
  }

  // Own the source so edits by the caller cannot change a cached result.
  const bytes = new Uint8Array(input.bytes);
  const info = inspectImage(bytes, contentType);
  checkDimensions(info.width, info.height);
  const key = `${contentType}:${await sha256Hex(bytes)}`;
  let entry = cache.get(key);
  if (entry) {
    cache.delete(key);
    cache.set(key, entry);
  } else {
    entry = {
      promise: encodeCover(bytes, contentType, info),
      // Count retained results, so a large source can cache its small output.
      bytes: 0,
    };
    cache.set(key, entry);
    trimCache();
    const inserted = entry;
    void entry.promise.then(
      (result) => {
        if (cache.get(key) === inserted) {
          inserted.bytes = result.bytes.length;
          trimCache();
        }
      },
      () => {
        if (cache.get(key) === inserted) cache.delete(key);
      },
    );
  }

  const result = await entry.promise;
  return { ...result, bytes: new Uint8Array(result.bytes) };
}

function trimCache() {
  let total = [...cache.values()].reduce((sum, entry) => sum + entry.bytes, 0);
  while (cache.size > MAX_CACHE_ENTRIES || total > MAX_CACHE_BYTES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    total -= cache.get(oldestKey)!.bytes;
    cache.delete(oldestKey);
  }
}

async function encodeCover(
  bytes: Uint8Array,
  contentType: OptimizedCoverImage["contentType"],
  info: ImageInfo,
): Promise<OptimizedCoverImage> {
  const original = {
    bytes,
    contentType,
    width: info.width,
    height: info.height,
  };
  const decoded = await decodeImage(
    new Blob([new Uint8Array(bytes)], { type: contentType }),
  );
  let canvas: HTMLCanvasElement | undefined;
  try {
    checkDimensions(decoded.width, decoded.height);
    // Canvas only keeps one frame. Leave animated covers to existing upload limits.
    if (info.animated) return original;

    const scale = Math.min(
      1,
      MAX_SIDE / Math.max(decoded.width, decoded.height),
    );
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const resized = scale < 1;
    canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      if (!resized) return original;
      throw new Error("Could not resize the cover image.");
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(decoded.image, 0, 0, width, height);

    let encoded = await canvasBlob(canvas, "image/webp", 0.82);
    if (encoded?.type !== "image/webp") {
      if (!resized) return original;
      // Browsers without a WebP encoder commonly return PNG instead.
      if (encoded?.type !== "image/png") {
        encoded = await canvasBlob(canvas, "image/png");
      }
      if (encoded?.type !== "image/png") {
        throw new Error("Could not resize the cover image.");
      }
    }
    if (!encoded.size) {
      if (!resized) return original;
      throw new Error("Could not resize the cover image.");
    }
    if (!resized && encoded.size >= bytes.length) return original;
    return {
      bytes: new Uint8Array(await encoded.arrayBuffer()),
      contentType: encoded.type as "image/webp" | "image/png",
      width,
      height,
    };
  } finally {
    decoded.close();
    if (canvas) canvas.width = canvas.height = 0;
  }
}

async function decodeImage(blob: Blob): Promise<{
  image: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: "from-image",
      });
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      throw new Error(
        "Could not read the cover image. Choose a valid JPEG, PNG, or WebP file.",
      );
    }
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(blob);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        close: () => {
          image.src = "";
        },
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        new Error(
          "Could not read the cover image. Choose a valid JPEG, PNG, or WebP file.",
        ),
      );
    };
    image.src = url;
  });
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob(resolve, type, quality);
    } catch {
      resolve(null);
    }
  });
}

function checkDimensions(width: number, height: number) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > MAX_SOURCE_PIXELS
  ) {
    throw new Error(
      "Cover images must have valid dimensions and no more than 40 megapixels.",
    );
  }
}

// Read dimensions before decoding so a small compressed file cannot request an enormous bitmap.
// Walking actual chunks also avoids mistaking metadata text for an animation marker.
function inspectImage(
  bytes: Uint8Array,
  type: OptimizedCoverImage["contentType"],
): ImageInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + 4));
  const invalid = () =>
    new Error("The cover image is invalid or does not match its file type.");
  if (type === "image/png") {
    if (
      bytes.length < 33 ||
      !PNG_SIGNATURE.every((byte, index) => bytes[index] === byte) ||
      tag(12) !== "IHDR" ||
      view.getUint32(8) !== 13
    )
      throw invalid();
    const info = {
      width: view.getUint32(16),
      height: view.getUint32(20),
      animated: false,
    };
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset);
      if (length > bytes.length - offset - 12) throw invalid();
      const name = tag(offset + 4);
      if (name === "acTL" || name === "fcTL" || name === "fdAT")
        info.animated = true;
      offset += length + 12;
      if (name === "IEND") return info;
    }
    throw invalid();
  }
  if (type === "image/webp") {
    if (bytes.length < 20 || tag(0) !== "RIFF" || tag(8) !== "WEBP")
      throw invalid();
    const end = view.getUint32(4, true) + 8;
    if (end > bytes.length || end < 20) throw invalid();
    const info = { width: 0, height: 0, animated: false };
    const uint24 = (offset: number) =>
      bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16);
    let offset = 12;
    while (offset + 8 <= end) {
      const name = tag(offset);
      const length = view.getUint32(offset + 4, true);
      const data = offset + 8;
      if (length > end - data) throw invalid();
      if (name === "VP8X" && length >= 10) {
        info.width = uint24(data + 4) + 1;
        info.height = uint24(data + 7) + 1;
        info.animated ||= (bytes[data] & 2) !== 0;
      } else if (!info.width && name === "VP8 " && length >= 10) {
        if (
          bytes[data + 3] !== 0x9d ||
          bytes[data + 4] !== 1 ||
          bytes[data + 5] !== 0x2a
        )
          throw invalid();
        info.width = view.getUint16(data + 6, true) & 0x3fff;
        info.height = view.getUint16(data + 8, true) & 0x3fff;
      } else if (!info.width && name === "VP8L" && length >= 5) {
        if (bytes[data] !== 0x2f) throw invalid();
        const dimensions = view.getUint32(data + 1, true);
        info.width = (dimensions & 0x3fff) + 1;
        info.height = ((dimensions >>> 14) & 0x3fff) + 1;
      }
      if (name === "ANIM" || name === "ANMF") info.animated = true;
      offset = data + length + (length % 2);
    }
    if (offset !== end || !info.width) throw invalid();
    return info;
  }
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8)
    throw invalid();
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset++] !== 0xff) throw invalid();
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9 || offset + 2 > bytes.length) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = view.getUint16(offset);
    if (length < 2 || length > bytes.length - offset) throw invalid();
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker)
    ) {
      if (length < 8) throw invalid();
      return {
        width: view.getUint16(offset + 5),
        height: view.getUint16(offset + 3),
        animated: false,
      };
    }
    offset += length;
  }
  throw invalid();
}
