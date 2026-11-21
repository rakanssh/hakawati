import { decodeImage } from "./cover-image";

export const MAX_CHAT_IMAGES = 4;
const MAX_EDGE = 1568;

export async function chatImageFromFile(file: Blob): Promise<string> {
  const decoded = await decodeImage(file);
  const canvas = document.createElement("canvas");
  try {
    const scale = Math.min(
      1,
      MAX_EDGE / Math.max(decoded.width, decoded.height),
    );
    canvas.width = Math.max(1, Math.round(decoded.width * scale));
    canvas.height = Math.max(1, Math.round(decoded.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not read the image.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingQuality = "high";
    context.drawImage(decoded.image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    decoded.close();
    canvas.width = canvas.height = 0;
  }
}
