import { Buffer } from "node:buffer";
import console from "node:console";
import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL, URLSearchParams } from "node:url";

const SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";
const API =
  "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";
const UPLOAD_API =
  "https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications";

function errorDetail(body) {
  try {
    return JSON.parse(body)?.error?.message ?? body;
  } catch {
    return body;
  }
}

export class PlayApiError extends Error {
  constructor(step, status, body) {
    const detail = errorDetail(body);
    super(`${step} failed (${status}): ${detail}`);
    this.status = status;
    this.detail = detail;
  }
}

export function parseServiceAccount(json) {
  let credentials;
  try {
    credentials = JSON.parse(json);
  } catch {
    throw new Error("PLAY_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }
  if (!credentials?.client_email || !credentials?.private_key) {
    throw new Error(
      "PLAY_SERVICE_ACCOUNT_JSON needs the client_email and private_key of a service account key.",
    );
  }
  return credentials;
}

const base64url = (value) => Buffer.from(value).toString("base64url");

export function signAssertion(
  credentials,
  now = Math.floor(Date.now() / 1000),
) {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: credentials.client_email,
      scope: SCOPE,
      aud: credentials.token_uri ?? DEFAULT_TOKEN_URI,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${signer.sign(credentials.private_key, "base64url")}`;
}

async function call(fetchImpl, step, url, init) {
  const response = await fetchImpl(url, init);
  const text = await response.text();
  if (!response.ok) throw new PlayApiError(step, response.status, text);
  return text ? JSON.parse(text) : {};
}

async function accessToken(fetchImpl, credentials) {
  const token = await call(
    fetchImpl,
    "Signing in as the service account",
    credentials.token_uri ?? DEFAULT_TOKEN_URI,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: signAssertion(credentials),
      }).toString(),
    },
  );
  return token.access_token;
}

// Play only accepts draft releases until the app has been published once.
const isDraftAppError = (error) =>
  error instanceof PlayApiError && /draft app/i.test(error.detail);

export async function uploadBundle({
  fetch: fetchImpl = globalThis.fetch,
  credentials,
  packageName,
  track,
  bundle,
  releaseName,
}) {
  const auth = {
    authorization: `Bearer ${await accessToken(fetchImpl, credentials)}`,
  };
  const app = `${API}/${packageName}`;

  const edit = await call(fetchImpl, "Starting an edit", `${app}/edits`, {
    method: "POST",
    headers: auth,
  });
  const uploaded = await call(
    fetchImpl,
    "Uploading the bundle",
    `${UPLOAD_API}/${packageName}/edits/${edit.id}/bundles?uploadType=media`,
    {
      method: "POST",
      headers: { ...auth, "content-type": "application/octet-stream" },
      body: bundle,
    },
  );
  const versionCode = String(uploaded.versionCode);

  const assign = (status) =>
    call(
      fetchImpl,
      `Adding the release to the ${track} track`,
      `${app}/edits/${edit.id}/tracks/${track}`,
      {
        method: "PUT",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({
          track,
          releases: [
            { name: releaseName, versionCodes: [versionCode], status },
          ],
        }),
      },
    );

  let status = "completed";
  try {
    await assign(status);
  } catch (error) {
    if (!isDraftAppError(error)) throw error;
    status = "draft";
    await assign(status);
  }

  await call(
    fetchImpl,
    "Committing the edit",
    `${app}/edits/${edit.id}:commit`,
    {
      method: "POST",
      headers: auth,
    },
  );
  return { versionCode, status };
}

async function main() {
  const [packageName, track, bundlePath, releaseName] = process.argv.slice(2);
  if (!packageName || !track || !bundlePath || !releaseName) {
    throw new Error(
      "Usage: node scripts/play-upload.mjs <package> <track> <bundle.aab> <release name>",
    );
  }
  const credentials = parseServiceAccount(
    process.env.PLAY_SERVICE_ACCOUNT_JSON ?? "",
  );
  const { versionCode, status } = await uploadBundle({
    credentials,
    packageName,
    track,
    bundle: await readFile(bundlePath),
    releaseName,
  });
  console.log(
    `Uploaded ${releaseName} (version code ${versionCode}) to the ${track} track.`,
  );
  if (status === "draft") {
    console.log(
      `::notice::Play only takes draft releases until the app is published, so ${releaseName} is a draft on the ${track} track. Roll it out in Play Console.`,
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
