export function shouldUseNetworkOnly(pathname: string): boolean {
  return pathname.startsWith("/");
}

export function isLegacyServiceWorkerScript(scriptUrl: string): boolean {
  try {
    return new URL(scriptUrl).pathname === "/sw.js";
  } catch {
    return false;
  }
}
