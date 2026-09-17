import { useEffect, useRef, useState } from "react";
import { detectCoverImageContentType } from "@/lib/cover-image";
import { bytesToObjectUrl } from "@/lib/utils";

/** Keep a cover's URL stable across renders and database refreshes. */
export function useCoverImageUrl(bytes?: Uint8Array | null) {
  const current = useRef<{ bytes: Uint8Array; url: string } | null>(null);
  const [url, setUrl] = useState("");

  useEffect(() => {
    const previous = current.current;
    if (
      previous &&
      bytes &&
      previous.bytes.length === bytes.length &&
      previous.bytes.every((value, index) => value === bytes[index])
    ) {
      return;
    }

    const nextUrl = bytesToObjectUrl(
      bytes,
      bytes ? (detectCoverImageContentType(bytes) ?? "") : "",
    );
    current.current =
      nextUrl && bytes ? { bytes: bytes.slice(), url: nextUrl } : null;
    setUrl(nextUrl);
    if (previous) URL.revokeObjectURL(previous.url);
  }, [bytes]);

  useEffect(
    () => () => {
      if (current.current) URL.revokeObjectURL(current.current.url);
      current.current = null;
    },
    [],
  );

  return url;
}
