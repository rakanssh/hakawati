// @vitest-environment node
import { Buffer } from "node:buffer";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { URL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  parseServiceAccount,
  signAssertion,
  uploadBundle,
} from "./play-upload.mjs";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const credentials = {
  client_email: "publisher@example.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
};

function fakePlay(overrides = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method, body: init.body });
    const path = new URL(url).pathname;
    const respond = (status, body) => ({
      ok: status < 400,
      status,
      text: async () => JSON.stringify(body),
    });
    if (url === "https://oauth2.googleapis.com/token") {
      return respond(200, { access_token: "token" });
    }
    if (path.endsWith("/edits") && init.method === "POST")
      return respond(200, { id: "edit-1" });
    if (path.endsWith("/bundles"))
      return respond(200, { versionCode: 1005000 });
    if (path.includes("/tracks/")) {
      const status = JSON.parse(init.body).releases[0].status;
      return overrides.track?.(status) ?? respond(200, {});
    }
    if (path.endsWith(":commit")) return respond(200, { id: "edit-1" });
    return respond(404, { error: { message: `unexpected ${path}` } });
  };
  return { fetch, calls };
}

describe("play upload", () => {
  it("signs a service account assertion for the Play publisher scope", () => {
    const [header, claims, signature] = signAssertion(credentials, 1000).split(
      ".",
    );
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${claims}`);
    expect(verifier.verify(publicKey, signature, "base64url")).toBe(true);
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toEqual({
      iss: credentials.client_email,
      scope: "https://www.googleapis.com/auth/androidpublisher",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1000,
      exp: 4600,
    });
  });

  it("uploads the bundle and rolls it out on the track", async () => {
    const play = fakePlay();
    const result = await uploadBundle({
      fetch: play.fetch,
      credentials,
      packageName: "dev.hakawati.app",
      track: "internal",
      bundle: Buffer.from("aab"),
      releaseName: "1.5.0",
    });

    expect(result).toEqual({ versionCode: "1005000", status: "completed" });
    expect(
      play.calls.map((c) => `${c.method} ${new URL(c.url).pathname}`),
    ).toEqual([
      "POST /token",
      "POST /androidpublisher/v3/applications/dev.hakawati.app/edits",
      "POST /upload/androidpublisher/v3/applications/dev.hakawati.app/edits/edit-1/bundles",
      "PUT /androidpublisher/v3/applications/dev.hakawati.app/edits/edit-1/tracks/internal",
      "POST /androidpublisher/v3/applications/dev.hakawati.app/edits/edit-1:commit",
    ]);
    expect(JSON.parse(play.calls[3].body)).toEqual({
      track: "internal",
      releases: [
        { name: "1.5.0", versionCodes: ["1005000"], status: "completed" },
      ],
    });
  });

  it("falls back to a draft release while the app is unpublished", async () => {
    const play = fakePlay({
      track: (status) =>
        status === "completed"
          ? {
              ok: false,
              status: 400,
              text: async () =>
                JSON.stringify({
                  error: {
                    message:
                      "Only releases with status draft may be created on draft app.",
                  },
                }),
            }
          : undefined,
    });

    const result = await uploadBundle({
      fetch: play.fetch,
      credentials,
      packageName: "dev.hakawati.app",
      track: "internal",
      bundle: Buffer.from("aab"),
      releaseName: "1.5.0",
    });

    expect(result.status).toBe("draft");
    expect(play.calls.filter((c) => c.method === "PUT")).toHaveLength(2);
    expect(play.calls.at(-1).url).toMatch(/:commit$/);
  });

  it("stops without committing when Play rejects the bundle", async () => {
    const play = fakePlay({
      track: () => ({
        ok: false,
        status: 403,
        text: async () =>
          JSON.stringify({
            error: { message: "The caller does not have permission" },
          }),
      }),
    });

    await expect(
      uploadBundle({
        fetch: play.fetch,
        credentials,
        packageName: "dev.hakawati.app",
        track: "internal",
        bundle: Buffer.from("aab"),
        releaseName: "1.5.0",
      }),
    ).rejects.toThrow(
      "Adding the release to the internal track failed (403): The caller does not have permission",
    );
    expect(play.calls.some((c) => c.url.endsWith(":commit"))).toBe(false);
  });

  it("explains a missing or malformed key", () => {
    expect(() => parseServiceAccount("")).toThrow("not valid JSON");
    expect(() => parseServiceAccount("{}")).toThrow(
      "client_email and private_key",
    );
  });
});
