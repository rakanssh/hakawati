async function hashedKey(prefix: string, tuple: unknown[]): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(tuple)),
  );
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${prefix}-${hex}`;
}

export async function createUploadIdempotencyKey(
  profileId: string,
  accountScope: string,
  localTaleId: string,
  updatedAt: number,
): Promise<string> {
  return hashedKey("upload", [profileId, accountScope, localTaleId, updatedAt]);
}

// Tales opened from the cloud keep their id on every device, so the writer is
// part of the key: only this device can reuse it, and the server refusing a
// reused key then means this device's earlier write already landed.
export async function createLinkedWriteIdempotencyKey(
  profileId: string,
  writerId: string,
  localTaleId: string,
  contentRev: string | null,
  metadataRev: string | null,
): Promise<string> {
  return hashedKey("sync", [
    profileId,
    writerId,
    localTaleId,
    contentRev,
    metadataRev,
  ]);
}
