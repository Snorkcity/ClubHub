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
    const checkPermission = () => {
      setPermission("Notification" in window ? Notification.permission : "denied");
    };
    checkPermission();
    window.addEventListener("focus", checkPermission);
    document.addEventListener("visibilitychange", checkPermission);
    return () => {
      window.removeEventListener("focus", checkPermission);
      document.removeEventListener("visibilitychange", checkPermission);
    };
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

  // A first-time registration may still be installing. PushManager.subscribe()
  // requires an active worker; otherwise the first Enable click can fail.
  if (registration.active?.state !== "activated") {
    await new Promise<void>((resolve, reject) => {
      const worker = registration.installing ?? registration.waiting ?? registration.active;
      if (!worker) {
        reject(new Error("The notification service could not start. Please try again."));
        return;
      }
      const finish = (error?: Error) => {
        clearTimeout(timeout);
        worker.removeEventListener("statechange", check);
        if (error) reject(error);
        else resolve();
      };
      const check = () => {
        if (worker.state === "activated") finish();
        else if (worker.state === "redundant") finish(new Error("The notification service could not start. Please try again."));
      };
      const timeout = setTimeout(() => finish(new Error("Notification setup took too long. Please try again.")), 15_000);
      worker.addEventListener("statechange", check);
      check();
    });
  }

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
