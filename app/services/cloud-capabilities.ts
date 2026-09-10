import packageMetadata from "../../package.json";

export const HAKAWATI_API_VERSION = "1";
export const HAKAWATI_CLIENT_VERSION = packageMetadata.version;

export const HAKAWATI_CLIENT_HEADERS = {
  "X-Hakawati-Api-Version": HAKAWATI_API_VERSION,
  "X-Hakawati-Client-Version": HAKAWATI_CLIENT_VERSION,
} as const;

export type CloudFeatureState = {
  state: "available" | "degraded" | "unavailable";
  reason?: string;
};

export type CloudCapabilities = {
  server: "hakawati-cloud";
  apiVersion: string;
  minimumClientVersion: string;
  compatibility:
    | { state: "compatible" }
    | { state: "unsupported"; reason: string };
  cloudSaveProtocol: number;
  features: {
    sync: CloudFeatureState;
    catalogRead: CloudFeatureState;
    coverStorage: CloudFeatureState;
    publishing: CloudFeatureState;
  };
  limits: {
    maxPackageBytes: number;
    maxStateBytes: number;
  };
  scenarioCatalog: {
    packageFormatVersion: number;
    thumbnailUploads: string;
  };
};

export function parseCloudCapabilities(
  value: unknown,
): CloudCapabilities | null {
  if (!isRecord(value) || value.server !== "hakawati-cloud") return null;
  if (
    typeof value.apiVersion !== "string" ||
    typeof value.minimumClientVersion !== "string" ||
    !positiveNumber(value.cloudSaveProtocol) ||
    !isRecord(value.compatibility) ||
    (value.compatibility.state !== "compatible" &&
      value.compatibility.state !== "unsupported") ||
    (value.compatibility.state === "unsupported" &&
      typeof value.compatibility.reason !== "string") ||
    !isRecord(value.features) ||
    !isRecord(value.limits) ||
    !isRecord(value.scenarioCatalog)
  ) {
    return null;
  }

  const sync = parseFeature(value.features.sync);
  const catalogRead = parseFeature(value.features.catalogRead);
  const coverStorage = parseFeature(value.features.coverStorage);
  const publishing = parseFeature(value.features.publishing);
  if (!sync || !catalogRead || !coverStorage || !publishing) return null;
  if (
    !positiveNumber(value.limits.maxPackageBytes) ||
    !positiveNumber(value.limits.maxStateBytes) ||
    !positiveNumber(value.scenarioCatalog.packageFormatVersion) ||
    typeof value.scenarioCatalog.thumbnailUploads !== "string"
  ) {
    return null;
  }

  return {
    server: "hakawati-cloud",
    apiVersion: value.apiVersion,
    minimumClientVersion: value.minimumClientVersion,
    compatibility: value.compatibility as CloudCapabilities["compatibility"],
    cloudSaveProtocol: value.cloudSaveProtocol,
    features: { sync, catalogRead, coverStorage, publishing },
    limits: {
      maxPackageBytes: value.limits.maxPackageBytes,
      maxStateBytes: value.limits.maxStateBytes,
    },
    scenarioCatalog: {
      packageFormatVersion: value.scenarioCatalog.packageFormatVersion,
      thumbnailUploads: value.scenarioCatalog.thumbnailUploads,
    },
  };
}

export function isCloudClientCompatible(capabilities: CloudCapabilities) {
  return (
    capabilities.apiVersion === HAKAWATI_API_VERSION &&
    capabilities.compatibility.state === "compatible" &&
    compareVersions(
      HAKAWATI_CLIENT_VERSION,
      capabilities.minimumClientVersion,
    ) >= 0
  );
}

export function cloudFeatureAvailable(
  capabilities: CloudCapabilities | null | undefined,
  feature: keyof CloudCapabilities["features"],
) {
  return Boolean(
    capabilities &&
      isCloudClientCompatible(capabilities) &&
      capabilities.features[feature].state === "available",
  );
}

function parseFeature(value: unknown): CloudFeatureState | null {
  if (!isRecord(value)) return null;
  if (
    value.state !== "available" &&
    value.state !== "degraded" &&
    value.state !== "unavailable"
  ) {
    return null;
  }
  if (value.reason !== undefined && typeof value.reason !== "string") {
    return null;
  }
  return {
    state: value.state,
    ...(value.reason ? { reason: value.reason } : {}),
  };
}

export function compareVersions(left: string, right: string) {
  const leftVersion = parseVersion(left);
  const rightVersion = parseVersion(right);
  if (!leftVersion || !rightVersion) return -1;
  for (let index = 0; index < 3; index += 1) {
    const delta = compareNumericIdentifier(
      leftVersion.parts[index],
      rightVersion.parts[index],
    );
    if (delta !== 0) return delta;
  }
  const leftPre = leftVersion.prerelease;
  const rightPre = rightVersion.prerelease;
  if (leftPre.length && !rightPre.length) return -1;
  if (!leftPre.length && rightPre.length) return 1;
  for (
    let index = 0;
    index < Math.max(leftPre.length, rightPre.length);
    index += 1
  ) {
    const leftPart = leftPre[index];
    const rightPart = rightPre[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumeric = /^[0-9]+$/.test(leftPart);
    const rightNumeric = /^[0-9]+$/.test(rightPart);
    if (leftNumeric && rightNumeric)
      return compareNumericIdentifier(leftPart, rightPart);
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

function parseVersion(value: string) {
  const match =
    /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(
      value,
    );
  if (!match || match[0] !== value) return null;
  const prerelease = match[4]?.split(".") ?? [];
  if (prerelease.some((part) => /^0[0-9]+$/.test(part))) return null;
  return {
    parts: [match[1], match[2], match[3]],
    prerelease,
  };
}

function compareNumericIdentifier(left: string, right: string) {
  return (
    left.length - right.length || (left === right ? 0 : left < right ? -1 : 1)
  );
}

function positiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
