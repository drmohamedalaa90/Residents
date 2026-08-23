import "./logbook-export-v220.js?v=220";
import "./senior-logbook-history-v224.js?v=228";
import "./schedule-meetings-refresh-state-v193.js?v=194";
import "./dual-role-bootstrap-v166.js?v=1.0.241";
import "./dual-role-v163.js?v=1.0.241";
import { sb } from "./supabase.js";

const ROOT_CLASS = "admin-red-theme";
const ADMIN_THEME_COLOR = "#430812";
const DEFAULT_THEME_COLOR = "#081c35";
const themeMeta = document.querySelector('meta[name="theme-color"]');

function applyRoleTheme(role) {
  const isAdmin = String(role || "").toLowerCase() === "owner";
  document.documentElement.classList.toggle(ROOT_CLASS, isAdmin);
  document.body?.classList.toggle(ROOT_CLASS, isAdmin);
  if (themeMeta) themeMeta.setAttribute("content", isAdmin ? ADMIN_THEME_COLOR : DEFAULT_THEME_COLOR);
}

async function resolveAndApplyTheme() {
  try {
    const { data: sessionData } = await sb.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) {
      applyRoleTheme("");
      return;
    }

    const { data: profile, error } = await sb
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw error;
    applyRoleTheme(profile?.role);
  } catch (error) {
    console.warn("Admin theme could not resolve the signed-in role", error);
    applyRoleTheme("");
  }
}

await resolveAndApplyTheme();

sb.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    applyRoleTheme("");
    return;
  }
  if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
    void resolveAndApplyTheme();
  }
});

if (!document.querySelector('link[data-audit-hierarchy-style]')) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "assets/audit-hierarchy.css?v=1.0.116";
  link.dataset.auditHierarchyStyle = "1";
  document.head.appendChild(link);
}

void import("./audit-hierarchy.js?v=1.0.116").catch((error) => {
  console.warn("Audit hierarchy tools could not load", error);
});

void import("./logbook-48h-limit-v158.js?v=1.0.159").catch((error) => {
  console.warn("48-hour logbook date rule could not load", error);
});

void import("./admin-logbook-delete-v160.js?v=1.0.162").catch((error) => {
  console.warn("Admin logbook delete controls could not load", error);
});

void import("./admin-online-exclusions-v166.js?v=1.0.241").catch((error) => {
  console.warn("Admin online exclusions could not load", error);
});

void import("./admin-push-center-v233.js?v=1.0.233").catch((error) => {
  console.warn("Admin push notification center could not load", error);
});

void import("./admin-dual-role-manager-v241.js?v=1.0.241").catch((error) => {
  console.warn("Admin dual-role manager could not load", error);
});

void import("./senior-logbook-response-gate-v167.js?v=1.0.167").catch((error) => {
  console.warn("Senior logbook response gate could not load", error);
});

void import("./admin-logbook-authority-v206.js?v=218").catch((error) => {
  console.warn("Admin logbook authority controls could not load", error);
});

void import("./admin-logbook-suspension-manual-v221.js?v=223").catch((error) => {
  console.warn("Manual logbook suspension controls could not load", error);
});

void import("./admin-bulk-penalties-v201.js?v=201").catch((error) => {
  console.warn("Admin bulk penalty tools could not load", error);
});

// Schedule/Meetings is intentionally loaded only once from app.html.
// Do not dynamically import it here: a second cache URL executes the meeting
// enhancement twice and duplicates lifecycle controls on Admin meeting cards.

// Stable authentication bootstrap: no forced refresh and no automatic sign-out.
