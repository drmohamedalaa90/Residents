import { sb } from "./supabase.js";

if (location.hostname.toLowerCase() === "drmohamedalaa90.github.io") {
  try {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {});
    }
  } catch (_) {}

  const target = `https://alexcardiology.github.io/Residents/${location.pathname.split("/").pop() || "app.html"}${location.search}${location.hash}`;
  location.replace(target);
}

const VAPID_PUBLIC = "BC5H5L4dqb6VTsWheVyxIS2j_Ol3pDyMbu9osQOtCghIT5qYM3GvF7IFxqSG0G6CLg0yKz_HS1oUVtBZekXrcj8";
const NATIVE_TOKEN_KEY = "cardiologyResidentsNativePushTokenV231";
const PUSH_PREFERENCE_KEY = "cardiologyResidentsPushEnabled";
const REPAIR_AT_KEY = "cardiologyResidentsPushRepairAtV242";
const REPAIR_INTERVAL_MS = 24 * 60 * 60 * 1000;

let busy = false;
let nativeListenersReady = false;
let nativeToken = localStorage.getItem(NATIVE_TOKEN_KEY) || "";

function toast(text) {
  const node = document.querySelector("#toast");
  if (!node) return;
  node.textContent = text;
  node.style.display = "block";
  setTimeout(() => { node.style.display = "none"; }, 4200);
}

function capacitorShell() {
  const cap = window.Capacitor;
  if (!cap) return false;

  try {
    if (typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) return true;
    const platform = typeof cap.getPlatform === "function" ? cap.getPlatform() : "";
    return platform === "android" || platform === "ios";
  } catch (_) {
    return false;
  }
}

function nativePushPlugin() {
  if (!capacitorShell()) return null;
  return window.Capacitor?.Plugins?.PushNotifications || null;
}

function nativePlatform() {
  try {
    return window.Capacitor?.getPlatform?.() || "android";
  } catch (_) {
    return "android";
  }
}

function androidLike() {
  return /Android/i.test(navigator.userAgent || "");
}

function likelyInAppBrowser() {
  const ua = navigator.userAgent || "";
  return /FBAN|FBAV|Instagram|Line\/|wv\)|; wv|WhatsApp/i.test(ua);
}

function pushSupport() {
  return {
    serviceWorker: "serviceWorker" in navigator,
    pushManager: "PushManager" in window,
    notification: "Notification" in window,
  };
}

function fullySupportedWeb() {
  const s = pushSupport();
  return s.serviceWorker && s.pushManager && s.notification;
}

function unsupportedMessage() {
  if (capacitorShell()) {
    return "Native notifications require the latest Cardiology Residents Android app. Please update the app, reopen it, then tap the bell again.";
  }

  if (androidLike()) {
    if (likelyInAppBrowser()) {
      return "Notifications are not available inside this in-app browser. Open Cardiology Residents in Chrome, Edge or Samsung Internet, then tap the bell again.";
    }

    return "This Android browser does not expose Web Push. Open Cardiology Residents in Chrome, Edge or Samsung Internet, then tap the bell again.";
  }

  return "Push notifications are not supported by this browser. Please open the portal in a browser that supports web notifications.";
}

function vapidBytes(base64) {
  const padding = "=".repeat((4 - base64.length % 4) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((ch) => ch.charCodeAt(0)));
}

async function saveNativeToken(token) {
  if (!token) return false;

  const { data } = await sb.auth.getSession();
  if (!data?.session) return false;

  const platform = nativePlatform() === "ios" ? "ios" : "android";
  const { error } = await sb.rpc("register_native_push_token_v231", {
    p_token: token,
    p_platform: platform,
    p_device_label: `${platform === "android" ? "Android" : "iOS"} app · ${navigator.platform || "Device"}`,
  });

  if (error) throw error;

  nativeToken = token;
  localStorage.setItem(NATIVE_TOKEN_KEY, token);
  localStorage.setItem(PUSH_PREFERENCE_KEY, "1");
  localStorage.setItem(REPAIR_AT_KEY, String(Date.now()));
  return true;
}

async function unregisterNativeToken() {
  const token = nativeToken || localStorage.getItem(NATIVE_TOKEN_KEY) || "";
  if (!token) return;

  try {
    await sb.rpc("unregister_native_push_token_v231", { p_token: token });
  } catch (_) {}

  localStorage.removeItem(NATIVE_TOKEN_KEY);
  nativeToken = "";
}

async function createNativeChannel() {
  const plugin = nativePushPlugin();
  if (!plugin || nativePlatform() !== "android" || typeof plugin.createChannel !== "function") return;

  try {
    await plugin.createChannel({
      id: "cardiology_residents",
      name: "Cardiology Residents",
      description: "Training, assessment and admin notifications",
      importance: 5,
      visibility: 1,
      vibration: true,
    });
  } catch (_) {}
}

function routeFromNativeAction(action) {
  const notification = action?.notification || {};
  const data = notification?.data || action?.data || {};
  return String(data?.route || notification?.route || "").trim();
}

async function setupNativeListeners() {
  const plugin = nativePushPlugin();
  if (!plugin || nativeListenersReady) return;

  nativeListenersReady = true;

  await plugin.addListener("registration", async (token) => {
    try {
      await saveNativeToken(String(token?.value || ""));
      toast("Push notifications enabled");
      void updateButton();
    } catch (error) {
      console.warn("Native push token registration failed", error);
      toast("Could not save this device for notifications");
    }
  });

  await plugin.addListener("registrationError", (error) => {
    console.warn("Native push registration error", error);
    toast("Could not enable Android notifications");
    void updateButton();
  });

  await plugin.addListener("pushNotificationActionPerformed", (action) => {
    const route = routeFromNativeAction(action);
    if (!route) return;

    if (route.startsWith("#")) location.hash = route;
    else if (/^https?:\/\//i.test(route)) location.href = route;
  });
}

async function ensureNativeSubscription(askPermission = false) {
  const plugin = nativePushPlugin();
  if (!plugin || busy) return false;

  busy = true;

  try {
    await setupNativeListeners();
    await createNativeChannel();

    let permission = await plugin.checkPermissions();
    if (askPermission && permission?.receive === "prompt") {
      permission = await plugin.requestPermissions();
    }

    if (permission?.receive !== "granted") return false;

    await plugin.register();
    return true;
  } finally {
    busy = false;
    void updateButton();
  }
}

async function webRegistration() {
  if (!fullySupportedWeb()) return null;
  const swUrl = new URL("../push-sw.js", import.meta.url);
  return navigator.serviceWorker.register(swUrl.href);
}

async function saveWebSubscription(sub) {
  const json = sub.toJSON();
  const keys = json.keys || {};

  const { error } = await sb.rpc("register_push_subscription_v125", {
    p_endpoint: json.endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
    p_device_label: `${navigator.platform || "Device"} · ${navigator.userAgent.includes("Mobile") ? "Mobile" : "Web"} · ${location.hostname}`,
  });

  if (error) throw error;

  localStorage.setItem(PUSH_PREFERENCE_KEY, "1");
  localStorage.setItem(REPAIR_AT_KEY, String(Date.now()));
}

async function ensureWebSubscription(askPermission = false) {
  if (busy) return false;
  busy = true;

  try {
    const reg = await webRegistration();
    if (!reg) return false;

    let permission = Notification.permission;
    if (askPermission && permission === "default") {
      permission = await Notification.requestPermission();
    }

    if (permission !== "granted") return false;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidBytes(VAPID_PUBLIC),
      });
    }

    await saveWebSubscription(sub);
    return true;
  } finally {
    busy = false;
    void updateButton();
  }
}

async function nativePermissionState() {
  const plugin = nativePushPlugin();
  if (!plugin) return "unsupported";

  try {
    const permission = await plugin.checkPermissions();
    return permission?.receive || "prompt";
  } catch (_) {
    return "unsupported";
  }
}

async function updateButton() {
  const btn = document.querySelector("#notificationEnableButton");
  if (!btn) return;

  btn.hidden = false;

  let permission = "unsupported";
  let mode = "web";

  if (nativePushPlugin()) {
    mode = "native";
    permission = await nativePermissionState();
  } else if (fullySupportedWeb()) {
    permission = Notification.permission;
  }

  btn.classList.toggle("is-enabled", permission === "granted");
  btn.classList.toggle("is-denied", permission === "denied");
  btn.classList.toggle("is-unsupported", permission === "unsupported");
  btn.textContent = permission === "denied" ? "🔕" : "🔔";

  btn.title = permission === "granted"
    ? `${mode === "native" ? "Android" : "Web"} push notifications enabled`
    : permission === "denied"
      ? "Notifications blocked in device settings"
      : permission === "unsupported"
        ? "Tap for notification setup instructions"
        : "Enable push notifications";

  btn.setAttribute("aria-label", btn.title);
}

function installButton() {
  const header = document.querySelector(".workspace > header");
  if (!header || document.querySelector("#notificationEnableButton")) return;

  const btn = document.createElement("button");
  btn.id = "notificationEnableButton";
  btn.type = "button";

  const refresh = document.querySelector("#mobileHeaderRefresh");
  header.insertBefore(btn, refresh || null);

  btn.addEventListener("click", async () => {
    const native = nativePushPlugin();

    if (native) {
      try {
        const permission = await native.checkPermissions();

        if (permission?.receive === "denied") {
          return alert("Notifications are blocked for Cardiology Residents. Open Android Settings → Apps → Cardiology Residents → Notifications and allow notifications, then return and tap the bell again.");
        }

        const ok = await ensureNativeSubscription(true);
        if (!ok) toast("Notification permission was not enabled");
      } catch (error) {
        alert(error?.message || String(error));
      }

      return;
    }

    if (capacitorShell() || !fullySupportedWeb()) {
      return alert(unsupportedMessage());
    }

    if (Notification.permission === "denied") {
      return alert(
        androidLike()
          ? "Notifications are blocked for this site. Open your browser Site settings → Notifications → Allow for alexcardiology.github.io, then return here and tap the bell again."
          : "Notifications are blocked. Allow them in your browser/site settings first.",
      );
    }

    try {
      const ok = await ensureWebSubscription(true);
      toast(ok ? "Push notifications enabled" : "Notification permission was not enabled");
    } catch (error) {
      alert(error?.message || String(error));
    }
  });

  void updateButton();
}

function automaticRepairDue() {
  if (localStorage.getItem(PUSH_PREFERENCE_KEY) !== "1") return false;

  const last = Number(localStorage.getItem(REPAIR_AT_KEY) || 0);
  return !Number.isFinite(last) || Date.now() - last >= REPAIR_INTERVAL_MS;
}

async function repairPushSubscriptionOnceDaily() {
  if (!automaticRepairDue()) return false;

  try {
    const { data } = await sb.auth.getSession();
    if (!data?.session) return false;

    if (nativePushPlugin()) {
      const permission = await nativePermissionState();
      if (permission !== "granted") return false;

      const ok = await ensureNativeSubscription(false);
      if (ok) localStorage.setItem(REPAIR_AT_KEY, String(Date.now()));
      return ok;
    }

    if (!fullySupportedWeb() || Notification.permission !== "granted") return false;

    const ok = await ensureWebSubscription(false);
    if (ok) localStorage.setItem(REPAIR_AT_KEY, String(Date.now()));
    return ok;
  } catch (error) {
    console.warn("Daily push subscription repair failed", error);
    return false;
  }
}

async function boot() {
  installButton();

  if (nativePushPlugin()) {
    await setupNativeListeners();
    await createNativeChannel();
  }

  // At most one automatic repair per 24 hours/device.
  // No focus / online / pageshow / visibility repair loops.
  void repairPushSubscriptionOnceDaily();
}

new MutationObserver(installButton).observe(document.documentElement, {
  childList: true,
  subtree: true,
});

document.addEventListener("click", (event) => {
  if (event.target.closest?.("#logout") && nativePushPlugin()) {
    void unregisterNativeToken();
  }
}, true);

void boot();
