import { sb } from "./supabase.js";

const MODE_KEY = "cardiology-dual-role-mode";
let currentUserId = "";
let dualAssessor = false;
let primaryRole = "";
let residencyYear = null;

function effectiveMode() {
  return dualAssessor && localStorage.getItem(MODE_KEY) === "assessor" ? "assessor" : "resident";
}

function adaptProfile(data) {
  if (!dualAssessor || effectiveMode() !== "assessor" || !data) return data;
  if (Array.isArray(data)) {
    return data.map((row) => row && String(row.id || "") === currentUserId
      ? { ...row, role: "assessor", __primary_role: "resident", __dual_role_assessor: true }
      : row);
  }
  if (typeof data === "object" && String(data.id || "") === currentUserId) {
    return { ...data, role: "assessor", __primary_role: "resident", __dual_role_assessor: true };
  }
  return data;
}

async function initializeCapability() {
  try {
    const { data: sessionData } = await sb.auth.getSession();
    currentUserId = String(sessionData?.session?.user?.id || "");
    if (!currentUserId) return;

    const { data, error } = await sb.rpc("get_my_role_capabilities");
    if (error || !data) return;

    primaryRole = String(data.primary_role || "");
    residencyYear = Number(data.residency_year) || null;

    // Admin now controls dual-role eligibility in profile_role_capabilities.
    // Keep the primary database role as Resident; Assessor is an extra capability.
    dualAssessor = primaryRole === "resident" && data.assessor === true;

    if (!dualAssessor) localStorage.removeItem(MODE_KEY);
  } catch (error) {
    console.warn("Dual-role capability could not be loaded", error);
  }
}

await initializeCapability();

// Supabase query builders return a NEW builder after select/eq/etc.
// Wrap the entire profiles chain and adapt ONLY the signed-in dual-role resident
// while they deliberately use Assessor view.
if (dualAssessor) {
  const originalFrom = sb.from.bind(sb);

  const wrapProfilesBuilder = (builder) => new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === "then") {
        return (resolve, reject) => Promise.resolve(target).then(
          (result) => {
            if (result && !result.error) result.data = adaptProfile(result.data);
            return resolve ? resolve(result) : result;
          },
          reject,
        );
      }

      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;

      return (...args) => {
        const next = value.apply(target, args);
        if (next && typeof next === "object" && typeof next.then === "function") {
          return wrapProfilesBuilder(next);
        }
        return next;
      };
    },
  });

  sb.from = (table, ...rest) => {
    const builder = originalFrom(table, ...rest);
    return table === "profiles" ? wrapProfilesBuilder(builder) : builder;
  };
}

function addSwitcher() {
  if (!dualAssessor || document.querySelector("#dualRoleSwitcher")) return;

  const header = document.querySelector(".workspace > header");
  if (!header) return;

  const button = document.createElement("button");
  button.id = "dualRoleSwitcher";
  button.type = "button";
  button.className = "dual-role-switcher";

  const assessorMode = effectiveMode() === "assessor";
  button.innerHTML = `<span aria-hidden="true">⇄</span><span>${assessorMode ? "Switch to Resident view" : "Switch to Assessor view"}</span>`;
  button.title = assessorMode
    ? `Return to your resident training view${residencyYear ? ` (Year ${residencyYear})` : ""}`
    : "Open your assessor tools";

  button.addEventListener("click", () => {
    localStorage.setItem(MODE_KEY, assessorMode ? "resident" : "assessor");
    location.hash = "#dashboard";
    location.reload();
  });

  const profileChip = document.querySelector("#profileChip");
  if (profileChip) profileChip.insertAdjacentElement("afterend", button);
  else header.appendChild(button);
}

const style = document.createElement("style");
style.textContent = `
  .dual-role-switcher{display:inline-flex;align-items:center;gap:8px;min-height:42px;padding:0 14px;border:1px solid #cbd5e1;border-radius:14px;background:#fff;color:#0f2742;font-weight:800;white-space:nowrap;cursor:pointer}
  .dual-role-switcher:hover{background:#f8fafc;border-color:#94a3b8}
  @media(max-width:850px){.dual-role-switcher{font-size:.72rem;padding:0 9px;min-height:38px}.dual-role-switcher span:first-child{display:none}}
`;
document.head.appendChild(style);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => setTimeout(addSwitcher, 0));
} else {
  setTimeout(addSwitcher, 0);
}
new MutationObserver(addSwitcher).observe(document.documentElement, { childList: true, subtree: true });
