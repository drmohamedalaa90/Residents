import { sb } from "./supabase.js";

// EDGE SAVER v242
// No interval, no focus refresh, no hash-change refresh, no DOM-observer refresh.
// Logbook badge data is refreshed only after the user presses the top-right
// Refresh button, which reloads the current page on demand.

const MANUAL_REFRESH_FLAG = "cardiologyManualRefreshV242";
let busy = false;

function actionablePriorExperience(rows = []) {
  return rows.filter((row) => {
    const status = String(row?.review_status || "").toLowerCase();
    const reconsideration = String(row?.reconsideration_status || "").toLowerCase();
    return status === "pending" || reconsideration === "requested";
  }).length;
}

async function refreshLogbookBadge() {
  if (busy) return;
  busy = true;

  try {
    const { data: { session } } = await sb.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return;

    const { data: profile, error: profileError } = await sb
      .from("profiles")
      .select("id,role,residency_year")
      .eq("id", userId)
      .maybeSingle();

    if (profileError || !profile) return;

    const juniorResident = profile.role === "resident" && Number(profile.residency_year) <= 2;

    const [logbookResult, reconsiderationResult, priorResult, minimumResult] = await Promise.all([
      sb.rpc("get_logbook_messages", { p_view: juniorResident ? "updates" : "received" }),
      sb.rpc("get_my_logbook_reconsiderations_v1044"),
      sb.rpc("get_prior_experience_review_queue_v1069"),
      profile.role === "assessor"
        ? sb.rpc("get_my_logbook_requirement_review_queue_v1084")
        : Promise.resolve({ data: [], error: null }),
    ]);

    const messageCount = (logbookResult.data || []).filter((message) =>
      juniorResident ? !message.is_read : !message.logbook_action_taken,
    ).length;

    const reconsiderationCount = (reconsiderationResult.data || []).filter((row) =>
      String(row.reviewer_id) === String(profile.id) && String(row.status) === "requested",
    ).length;

    const priorExperienceCount = actionablePriorExperience(priorResult.data || []);
    const minimumRequirementCount = (minimumResult.data || []).length;
    const total = messageCount + reconsiderationCount + priorExperienceCount + minimumRequirementCount;

    document.querySelectorAll("[data-logbook-badge]").forEach((badge) => {
      badge.textContent = String(total);
      badge.hidden = total === 0;
    });
  } catch (error) {
    console.debug("Manual logbook badge refresh unavailable", error);
  } finally {
    busy = false;
  }
}

function installRefreshStyle() {
  if (document.querySelector("#manualRefreshV242Style")) return;

  const style = document.createElement("style");
  style.id = "manualRefreshV242Style";
  style.textContent = `
    #mobileHeaderRefresh.edge-manual-refresh{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      gap:7px;
      min-height:40px;
      padding:0 12px;
      border-radius:12px;
      white-space:nowrap;
      font:inherit;
      font-weight:850;
      cursor:pointer;
    }
    #mobileHeaderRefresh.edge-manual-refresh .edge-refresh-icon{
      display:inline-block;
      font-size:1.05rem;
      line-height:1;
    }
    #mobileHeaderRefresh.edge-manual-refresh:disabled{
      opacity:.65;
      cursor:wait;
    }
    @media(max-width:850px){
      #mobileHeaderRefresh.edge-manual-refresh{
        width:42px;
        min-width:42px;
        padding:0;
      }
      #mobileHeaderRefresh.edge-manual-refresh .edge-refresh-text{display:none}
    }
  `;
  document.head.appendChild(style);
}

function installManualRefreshButton() {
  const button = document.querySelector("#mobileHeaderRefresh");
  if (!button || button.dataset.edgeManualRefresh === "1") return;

  installRefreshStyle();

  // Remove the old inline location.reload() handler so every manual refresh
  // can set the one-time refresh flag first.
  button.onclick = null;
  button.dataset.edgeManualRefresh = "1";
  button.classList.add("edge-manual-refresh");
  button.innerHTML = `<span class="edge-refresh-icon" aria-hidden="true">↻</span><span class="edge-refresh-text">Refresh</span>`;
  button.title = "Refresh current page and counters";
  button.setAttribute("aria-label", "Refresh current page and counters");

  button.addEventListener("click", () => {
    if (button.disabled) return;

    try {
      sessionStorage.setItem(MANUAL_REFRESH_FLAG, "1");
    } catch (_) {}

    button.disabled = true;
    button.innerHTML = `<span class="edge-refresh-icon" aria-hidden="true">↻</span><span class="edge-refresh-text">Refreshing…</span>`;
    location.reload();
  });
}

installManualRefreshButton();
new MutationObserver(installManualRefreshButton).observe(document.documentElement, {
  childList: true,
  subtree: true,
});

// Only a user-requested refresh is allowed to run the expensive badge queries.
let requested = false;
try {
  requested = sessionStorage.getItem(MANUAL_REFRESH_FLAG) === "1";
  if (requested) sessionStorage.removeItem(MANUAL_REFRESH_FLAG);
} catch (_) {}

if (requested) {
  // Wait until app.js has built navigation badges.
  setTimeout(() => void refreshLogbookBadge(), 700);
}
