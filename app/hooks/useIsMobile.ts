import { useState, useEffect } from "react";
import { detectPlatform, type Platform } from "@/lib/platform";

/**
 * Breakpoint for mobile viewport detection (matches Tailwind's `md:` breakpoint)
 */
const MOBILE_BREAKPOINT = 768;
const COMPACT_BREAKPOINT = 640;

export interface MobileDetection {
  /** True if viewport width is less than 768px */
  isMobileViewport: boolean;
  /** True if viewport width is less than 640px */
  isCompactViewport: boolean;
  /** True if running on Android or iOS (Tauri mobile build) */
  isMobilePlatform: boolean;
  /** True if either isMobileViewport OR isMobilePlatform */
  isMobile: boolean;
  /** The detected platform */
  platform: Platform;
}

/**
 * Hook to detect mobile viewport and mobile platform.
 * @returns Object containing mobile detection information
 */
export function useIsMobile(): MobileDetection {
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < MOBILE_BREAKPOINT;
  });
  const [isCompactViewport, setIsCompactViewport] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < COMPACT_BREAKPOINT;
  });

  const [platform] = useState(() => detectPlatform());

  useEffect(() => {
    const handleResize = () => {
      setIsMobileViewport(window.innerWidth < MOBILE_BREAKPOINT);
      setIsCompactViewport(window.innerWidth < COMPACT_BREAKPOINT);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isMobilePlatform = platform === "android" || platform === "ios";
  const isMobile = isMobileViewport || isMobilePlatform;

  return {
    isMobileViewport,
    isCompactViewport,
    isMobilePlatform,
    isMobile,
    platform,
  };
}
