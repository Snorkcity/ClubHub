import { useState, useEffect } from "react";

function serviceWorkerScope(basePath = "") {
  return `${basePath.replace(/\/$/, "")}/` || "/";
}

export function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushSupport() {
  const isSupported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window;

  const isIos =
    typeof window !== "undefined" &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) &&
    !(window as any).MSStream;

  const isStandalone =
    typeof window !== "undefined" &&
    ("standalone" in navigator
      ? (navigator as any).standalone
      : window.matchMedia("(display-mode: standalone)").matches);

  const [permission, setPermission] = useState<NotificationPermission>(
    isSupported && "Notification" in window ? Notification.permission : "denied"
  );

  useEffect(() => {
    if (!isSupported) return;
    const checkPermission = async () => {
      setPermission(Notification.permission);
    };
    checkPermission();
  }, [isSupported]);

  return {
    isSupported,
    isIos,
    isStandalone,
    permission,
    setPermission,
  };
}

export async function getSubscription(basePath = "") {
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration(
    serviceWorkerScope(basePath),
  );
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

export async function subscribeToPush(publicKey: string, basePath: string = "") {
  if (!("serviceWorker" in navigator)) return null;

  // Register the service worker, ensuring it has the correct scope
  const scope = serviceWorkerScope(basePath);
  const registration = await navigator.serviceWorker.register(`${scope}sw.js`, {
    scope,
  });

  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  return subscription;
}

export async function unsubscribeFromPush(basePath = "") {
  const subscription = await getSubscription(basePath);
  if (subscription) {
    await subscription.unsubscribe();
    return subscription.endpoint;
  }
  return null;
}
