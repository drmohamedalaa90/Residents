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

let adminModulesLoaded = false;

function applyRoleTheme(role) {
  const isAdmin = String(role || "").toLowerCase() === "owner";
  document.documentElement.classList.toggle(ROOT_CLASS, isAdmin);
  document.body?.classList.toggle(ROOT_CLASS, isAdmin);
  if (themeMeta) themeMeta.setAttribute("content", isAdmin ? ADMIN_THEME_COLOR : DEFAULT_THEME_COLOR);
  return isAdmin;
}

function loadUniversalEnhancements() {
  void import("./logbook-48h-limit-v158.js?v=1.0.159").catch((error) => {
    console.warn("48-hour logbook date rule could not load", error);
  });

  void import("./senior-logbook-response-gate-v167.js?v=1.0.167").catch((error) => {
    console.warn("Senior logbook response gate could not load", error);
  });
}

function loadAdminOnlyEnhancements() {
  if (adminModulesLoaded) return;
  adminModulesLoaded = true;

  // audit-hierarchy.js is already loaded from app.html.
  // Do NOT import it again here with another cache URL.

  void import("./admin-logbook-delete-v160.js?v=1.0.162").catch((error) => {
    console.warn("Admin logbook delete controls could not load", error);
  });

  // Push center is now lazy. Zero profile/capability reads happen until the
  // owner explicitly clicks Push notifications.
  void import("./admin-push-lazy-loader-v242.js?v=1.0.242").catch((error) => {
    console.warn("Admin push lazy loader could not load", error);
  });

  void import("./admin-dual-role-manager-v241.js?v=1.0.241").catch((error) => {
    console.warn("Admin dual-role manager could not load", error);
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
}

async function resolveAndApplyTheme() {
  try {
    const { data: sessionData } = await sb.auth.getSession();
    const userId = sessionData?.session?.user?.id;

    if (!userId) {
      applyRoleTheme("");
      return false;
    }

    const { data: profile, error } = await sb
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw error;

    const isOwner = applyRoleTheme(profile?.role);
    if (isOwner) loadAdminOnlyEnhancements();
    return isOwner;
  } catch (error) {
    console.warn("Admin theme could not resolve the signed-in role", error);
    applyRoleTheme("");
    return false;
  }
}

// Universal features that are relevant outside the Owner account remain loaded.
loadUniversalEnhancements();

// One role resolution at startup. Token refreshes no longer trigger another
// profile request merely to repaint the same theme.
await resolveAndApplyTheme();

sb.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    applyRoleTheme("");
    return;
  }

  // A genuine sign-in can change the account. TOKEN_REFRESHED and USER_UPDATED
  // are intentionally ignored to avoid repeated owner/profile reads.
  if (event === "SIGNED_IN") {
    void resolveAndApplyTheme();
  }
});

// Stable authentication bootstrap: no forced refresh and no automatic sign-out.
