import { useState, useEffect } from "react";
import { getDb } from "@/services/db";

let dbReadyPromise: Promise<void> | null = null;

async function ensureDbReady(): Promise<void> {
  dbReadyPromise ??= (async () => {
    const maxRetries = 10;
    const retryDelay = 100;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const db = await getDb();
        await db.select("SELECT 1");
        return;
      } catch (err) {
        if (attempt === maxRetries - 1) {
          dbReadyPromise = null;
          throw err;
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  })();
  return dbReadyPromise;
}

export function useDbReady() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensureDbReady()
      .then(() => setIsReady(true))
      .catch((err) => {
        console.error("[useDbReady] DB initialization failed:", err);
        setError(String(err));
      });
  }, []);

  return { isReady, error };
}
