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

// The writer is in the key because a cloud tale keeps its id on every device.
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
