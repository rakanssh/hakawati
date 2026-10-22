import { useState, useEffect } from "react";

/**
 * Breakpoint for mobile viewport detection (matches Tailwind's `md:` breakpoint)
 */
const MOBILE_BREAKPOINT = 768;
const COMPACT_BREAKPOINT = 640;

export enum Platform {
  ANDROID = "android",
  IOS = "ios",
  MACOS = "macos",
  WINDOWS = "windows",
  LINUX = "linux",
  WEB = "web",
}

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
 * Detects the current platform based on Tauri environment and user agent
 */
export function detectPlatform(): Platform {
  if (typeof window === "undefined") return Platform.WEB;

  if ("__TAURI_INTERNALS__" in window) {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("android")) return Platform.ANDROID;
    if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod"))
      return Platform.IOS;
    // An iPad's web view reports a desktop Mac; a Mac has no touch points.
    if (ua.includes("macintosh") && navigator.maxTouchPoints > 1)
      return Platform.IOS;

    if (navigator.platform) {
      const platform = navigator.platform.toLowerCase();
      if (platform.includes("mac")) return Platform.MACOS;
      if (platform.includes("win")) return Platform.WINDOWS;
      if (platform.includes("linux")) return Platform.LINUX;
    }
  }

  return Platform.WEB;
}

/**
 * True on the Android and iOS builds. Usable outside components because the
 * platform never changes while the app runs.
 */
export function isMobilePlatform(): boolean {
  const platform = detectPlatform();
  return platform === Platform.ANDROID || platform === Platform.IOS;
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
