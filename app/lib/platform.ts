export enum Platform {
  ANDROID = "android",
  IOS = "ios",
  MACOS = "macos",
  WINDOWS = "windows",
  LINUX = "linux",
  WEB = "web",
}

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

export function isMobilePlatform(): boolean {
  const platform = detectPlatform();
  return platform === Platform.ANDROID || platform === Platform.IOS;
}
