export async function createUploadIdempotencyKey(
  profileId: string,
  accountScope: string,
  localTaleId: string,
  updatedAt: number,
): Promise<string> {
  const tuple = JSON.stringify([
    profileId,
    accountScope,
    localTaleId,
    updatedAt,
  ]);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(tuple),
  );
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `upload-${hex}`;
}
