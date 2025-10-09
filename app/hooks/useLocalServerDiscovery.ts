import { useCallback, useMemo, useRef, useState } from "react";
import { ApiType } from "@/types/api.type";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

export interface DiscoveredServer {
  baseUrl: string;
  label: string;
  requiresAuth?: boolean;
}

//TODO: Test and add more
const knownNames = ["ollama", "localai"];

const knownPorts = [11434, 8000, 8080, 3000, 5000, 7860, 1234];

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutId: NodeJS.Timeout | number | undefined;
  return new Promise<T>((resolve, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("timeout")),
      ms,
    ) as unknown as number;
    promise
      .then((value) => resolve(value))
      .catch((err) => reject(err))
      .finally(() => clearTimeout(timeoutId as number));
  });
}

async function probeOpenAICompatible(
  baseUrl: string,
): Promise<DiscoveredServer | null> {
  const endpoint = `${baseUrl.replace(/\/$/, "")}/models`;
  try {
    const response = await withTimeout(
      tauriFetch(endpoint, { method: "GET" }),
      1200,
    );

    // Consider 2xx as compatible (and parseable JSON if possible)
    if (response.ok) {
      try {
        const json = await response.json().catch(() => null);
        const hasModelsArray =
          Array.isArray(json?.data) ||
          Array.isArray(json?.models) ||
          Array.isArray(json);
        if (hasModelsArray) {
          return {
            baseUrl,
            label: await deriveLabel(baseUrl),
            requiresAuth: false,
          };
        }
      } catch {
        // fall through
      }
      return {
        baseUrl,
        label: await deriveLabel(baseUrl),
        requiresAuth: false,
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        baseUrl,
        label: await deriveLabel(baseUrl),
        requiresAuth: true,
      };
    }
  } catch (error) {
    return null;
  }
  return null;
}

async function deriveLabel(baseUrl: string): Promise<string> {
  const port = new URL(baseUrl).port;
  return (
    (await labelByHome(baseUrl)) ?? `Local server ${port ? `:${port}` : ""}`
  );
}

async function labelByHome(baseUrl: string): Promise<string | null> {
  try {
    const rootUrl = baseUrl.split("/").slice(0, -1).join("/");
    const rootHtml = await tauriFetch(rootUrl).then((r) => r.text());
    console.log(`Root of ${baseUrl}:`, rootHtml);
    for (const name of knownNames) {
      console.log(`Checking for ${name} in ${rootHtml.toLowerCase()}`);
      if (rootHtml.toLowerCase().includes(name.toLowerCase())) {
        return `${name}`;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function useLocalServerDiscovery(apiType: ApiType) {
  const [servers, setServers] = useState<DiscoveredServer[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const lastScanRef = useRef<number | undefined>(undefined);

  const candidates = useMemo(() => {
    if (apiType !== ApiType.OPENAI) return [] as string[];
    const hosts = ["127.0.0.1"];
    const bases: string[] = [];
    for (const host of hosts) {
      for (const port of knownPorts) {
        bases.push(`http://${host}:${port}/v1`);
      }
    }
    return bases;
  }, [apiType]);

  const scanningRef = useRef(false);

  const scan = useCallback(async () => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    setScanning(true);
    setError(undefined);
    try {
      const results = await Promise.all(
        candidates.map((base) => probeOpenAICompatible(base)),
      );
      const discovered = results.filter(Boolean) as DiscoveredServer[];
      const unique = Array.from(
        new Map(discovered.map((s) => [s.baseUrl, s])).values(),
      );
      setServers(unique);
      lastScanRef.current = Date.now();
    } catch (e) {
      setError((e as Error)?.message ?? "Failed to scan local servers");
    } finally {
      scanningRef.current = false;
      setScanning(false);
    }
  }, [candidates]);

  return { servers, scanning, error, lastScanAt: lastScanRef.current, scan };
}
