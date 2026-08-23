import { sb } from "./supabase.js";

const CAPABILITY = "assessor";
const OWNER_SET_RPC = "owner_set_role_capability_v1241";
let dialog = null;
let loadedRows = [];
let busyIds = new Set();

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch]);
}

function isOwnerUi() {
  return document.documentElement.classList.contains("admin-red-theme")
    || document.body?.classList.contains("admin-red-theme");
}

function isAccountsRoute() {
  return String(location.hash || "").replace(/^#/, "").split("?")[0] === "users";
}

function addStyles() {
  if (document.querySelector("#adminDualRoleManagerStyles")) return;

  const style = document.createElement("style");
  style.id = "adminDualRoleManagerStyles";
  style.textContent = `
    .dual-role-admin-entry{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:14px 0 18px;padding:16px 18px;border:1px solid #eadde1;border-radius:18px;background:linear-gradient(145deg,#fff 0%,#fff8fa 100%);box-shadow:0 8px 22px rgba(67,8,18,.04)}
    .dual-role-admin-entry-copy{min-width:0}
    .dual-role-admin-entry-copy small{display:block;color:#9b4355;font-size:.68rem;font-weight:900;letter-spacing:.06em;text-transform:uppercase}
    .dual-role-admin-entry-copy b{display:block;margin-top:4px;color:#31151b;font-size:1rem}
    .dual-role-admin-entry-copy span{display:block;margin-top:4px;color:#756168;font-size:.78rem;line-height:1.45}
    .dual-role-admin-open{flex:0 0 auto;border:0;border-radius:12px;background:#7d1428;color:#fff;padding:10px 14px;font:inherit;font-weight:900;cursor:pointer}
    .dual-role-admin-open:hover{background:#64101f}
    .dual-role-manager-dialog{width:min(94vw,820px);max-height:88vh;border:0;border-radius:24px;padding:0;background:#fff;color:#29171d;box-shadow:0 28px 90px rgba(28,8,14,.28)}
    .dual-role-manager-dialog::backdrop{background:rgba(20,8,12,.54);backdrop-filter:blur(2px)}
    .dual-role-manager-shell{padding:22px}
    .dual-role-manager-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
    .dual-role-manager-head small{display:block;color:#a61f33;font-size:.68rem;font-weight:900;letter-spacing:.07em;text-transform:uppercase}
    .dual-role-manager-head h2{margin:4px 0 0;font-size:1.45rem}
    .dual-role-manager-head p{margin:6px 0 0;color:#756168;font-size:.82rem;line-height:1.5}
    .dual-role-manager-close{flex:0 0 38px;width:38px;height:38px;border:1px solid #ead8dd;border-radius:11px;background:#fff;color:#64111f;font-size:1.25rem;cursor:pointer}
    .dual-role-manager-search{width:100%;box-sizing:border-box;margin-top:18px;border:1px solid #dccbd0;border-radius:12px;padding:11px 12px;font:inherit}
    .dual-role-manager-list{margin-top:12px;border:1px solid #eadde1;border-radius:16px;overflow:hidden}
    .dual-role-manager-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:14px;padding:13px 14px;border-bottom:1px solid #f2e7ea;background:#fff}
    .dual-role-manager-row:last-child{border-bottom:0}
    .dual-role-manager-person{min-width:0}
    .dual-role-manager-person b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:.9rem}
    .dual-role-manager-person span{display:block;margin-top:3px;color:#756168;font-size:.72rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .dual-role-toggle{display:inline-flex;align-items:center;gap:9px}
    .dual-role-toggle button{min-width:112px;border:1px solid #d9c4ca;border-radius:11px;background:#fff;padding:9px 11px;font:inherit;font-size:.76rem;font-weight:900;color:#67404a;cursor:pointer}
    .dual-role-toggle button.on{border-color:#8ccba9;background:#edf9f2;color:#087443}
    .dual-role-toggle button:disabled{opacity:.55;cursor:wait}
    .dual-role-manager-note{margin-top:14px;padding:12px 13px;border-radius:13px;background:#faf4f6;color:#654752;font-size:.76rem;line-height:1.5}
    .dual-role-manager-empty{padding:22px;text-align:center;color:#7a6970;font-size:.82rem}
    @media(max-width:650px){
      .dual-role-admin-entry{align-items:flex-start;flex-direction:column}
      .dual-role-admin-open{width:100%}
      .dual-role-manager-shell{padding:18px}
      .dual-role-manager-row{grid-template-columns:1fr}
      .dual-role-toggle button{width:100%}
    }
  `;
  document.head.appendChild(style);
}

function ensureDialog() {
  if (dialog?.isConnected) return dialog;

  dialog = document.createElement("dialog");
  dialog.className = "dual-role-manager-dialog";
  dialog.id = "dualRoleManagerDialog";
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.body.appendChild(dialog);
  return dialog;
}

async function readResidentsAndCapabilities() {
  const [{ data: profiles, error: profileError }, { data: capabilities, error: capabilityError }] = await Promise.all([
    sb.from("profiles")
      .select("id,display_name,username,email,role,residency_year,is_active")
      .eq("role", "resident")
      .eq("is_active", true)
      .order("residency_year", { ascending: false })
      .order("display_name"),
    sb.from("profile_role_capabilities")
      .select("profile_id,capability,is_active")
      .eq("capability", CAPABILITY),
  ]);

  if (profileError) throw profileError;
  if (capabilityError) throw capabilityError;

  const enabledMap = new Map(
    (capabilities || []).map((row) => [String(row.profile_id), row.is_active === true]),
  );

  return (profiles || []).map((profile) => ({
    ...profile,
    dualAssessor: enabledMap.get(String(profile.id)) === true,
  }));
}

function rowHtml(row) {
  const enabled = row.dualAssessor === true;
  const year = Number(row.residency_year);
  const yearText = year === 6 ? "Visitor resident" : year === 7 ? "Fellow" : year ? `Year ${year}` : "Resident";
  const username = String(row.username || "").trim();
  const meta = [username ? `@${username.replace(/^@/, "")}` : "", yearText, row.email || ""].filter(Boolean).join(" · ");

  return `
    <div class="dual-role-manager-row" data-dual-role-row="${esc(row.id)}" data-dual-role-search="${esc(`${row.display_name || ""} ${row.username || ""} ${row.email || ""} ${yearText}`.toLowerCase())}">
      <div class="dual-role-manager-person">
        <b>${esc(row.display_name || row.username || "Resident")}</b>
        <span>${esc(meta)}</span>
      </div>
      <div class="dual-role-toggle">
        <button type="button" class="${enabled ? "on" : ""}" data-dual-role-toggle="${esc(row.id)}" data-enabled="${enabled ? "1" : "0"}">
          ${enabled ? "✓ Resident + Assessor" : "Make dual role"}
        </button>
      </div>
    </div>`;
}

function paintList(query = "") {
  const list = dialog?.querySelector("#dualRoleManagerList");
  if (!list) return;

  const q = String(query || "").trim().toLowerCase();
  const filtered = loadedRows.filter((row) => {
    if (!q) return true;
    const year = Number(row.residency_year);
    const yearText = year === 6 ? "visitor resident" : year === 7 ? "fellow" : year ? `year ${year}` : "resident";
    return `${row.display_name || ""} ${row.username || ""} ${row.email || ""} ${yearText}`.toLowerCase().includes(q);
  });

  list.innerHTML = filtered.length
    ? filtered.map(rowHtml).join("")
    : '<div class="dual-role-manager-empty">No residents found.</div>';
}

async function setDualRole(profileId, enabled) {
  // IMPORTANT: writes go through a SECURITY DEFINER owner-only RPC.
  // Direct insert/update is intentionally blocked by RLS.
  const { data, error } = await sb.rpc(OWNER_SET_RPC, {
    p_profile_id: profileId,
    p_capability: CAPABILITY,
    p_enabled: enabled,
  });

  if (error) throw error;
  if (data && typeof data === "object" && data.ok === false) {
    throw new Error(data.error || "Could not update dual-role access.");
  }
  return data;
}

function attachDialogEvents() {
  dialog?.querySelector(".dual-role-manager-close")?.addEventListener("click", () => dialog.close());
  dialog?.querySelector("#dualRoleManagerSearch")?.addEventListener("input", (event) => paintList(event.target.value));

  dialog?.querySelector("#dualRoleManagerList")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-dual-role-toggle]");
    if (!button) return;

    const profileId = String(button.dataset.dualRoleToggle || "");
    const row = loadedRows.find((item) => String(item.id) === profileId);
    if (!row || busyIds.has(profileId)) return;

    const enable = !row.dualAssessor;
    const label = row.display_name || row.username || "this resident";
    const question = enable
      ? `Give ${label} both Resident and Assessor access?`
      : `Remove Assessor access from ${label} and keep the Resident role?`;

    if (!window.confirm(question)) return;

    busyIds.add(profileId);
    button.disabled = true;
    button.textContent = enable ? "Enabling…" : "Removing…";

    try {
      await setDualRole(profileId, enable);

      row.dualAssessor = enable;
      paintList(dialog.querySelector("#dualRoleManagerSearch")?.value || "");

      const note = dialog.querySelector("#dualRoleManagerNote");
      if (note) {
        note.innerHTML = enable
          ? `<b>${esc(label)}</b> is now Resident + Assessor. Their primary role remains Resident. Ask them to refresh or sign in again; they will see <b>Switch to Assessor view</b>.`
          : `<b>${esc(label)}</b> is now Resident only. Assessor access has been removed.`;
      }
    } catch (error) {
      console.warn("Could not update dual role", error);
      alert(error?.message || "Could not update Resident + Assessor access.");
    } finally {
      busyIds.delete(profileId);
      const current = dialog?.querySelector(`[data-dual-role-toggle="${CSS.escape(profileId)}"]`);
      if (current) current.disabled = false;
    }
  });
}

async function openManager() {
  const d = ensureDialog();

  d.innerHTML = `
    <div class="dual-role-manager-shell">
      <div class="dual-role-manager-head">
        <div>
          <small>ADMIN · ACCOUNTS</small>
          <h2>Resident + Assessor access</h2>
          <p>Keep the account as a Resident while adding or removing Assessor capability.</p>
        </div>
        <button class="dual-role-manager-close" type="button" aria-label="Close">×</button>
      </div>
      <input id="dualRoleManagerSearch" class="dual-role-manager-search" type="search" placeholder="Search resident name, username, email or year">
      <div id="dualRoleManagerList" class="dual-role-manager-list"><div class="dual-role-manager-empty">Loading residents…</div></div>
      <div id="dualRoleManagerNote" class="dual-role-manager-note">
        The resident keeps all Resident data, curriculum and logbook. Enabling this only adds Assessor access and the Resident / Assessor switcher.
      </div>
    </div>`;

  attachDialogEvents();
  if (!d.open) d.showModal();

  try {
    loadedRows = await readResidentsAndCapabilities();
    paintList("");
  } catch (error) {
    console.warn("Dual-role manager could not load", error);
    const list = d.querySelector("#dualRoleManagerList");
    if (list) list.innerHTML = '<div class="dual-role-manager-empty">Could not load resident accounts. Please close and try again.</div>';
  }
}

function ensureEntry() {
  if (!isOwnerUi() || !isAccountsRoute()) return;

  const content = document.querySelector("#content");
  if (!content || content.querySelector("[data-dual-role-admin-entry]")) return;

  const entry = document.createElement("section");
  entry.className = "dual-role-admin-entry";
  entry.dataset.dualRoleAdminEntry = "1";
  entry.innerHTML = `
    <div class="dual-role-admin-entry-copy">
      <small>Access control</small>
      <b>Resident + Assessor</b>
      <span>Give a resident Assessor access without converting or deleting their Resident role.</span>
    </div>
    <button type="button" class="dual-role-admin-open">Manage dual roles</button>`;

  entry.querySelector(".dual-role-admin-open")?.addEventListener("click", openManager);

  const lead = content.querySelector(".lead");
  if (lead?.nextSibling) content.insertBefore(entry, lead.nextSibling);
  else content.prepend(entry);
}

function scheduleEntry() {
  if (!isOwnerUi() || !isAccountsRoute()) return;
  setTimeout(ensureEntry, 80);
}

function init() {
  if (!isOwnerUi()) return;
  addStyles();

  const content = document.querySelector("#content");
  if (content) new MutationObserver(scheduleEntry).observe(content, { childList: true, subtree: false });

  window.addEventListener("hashchange", scheduleEntry);
  scheduleEntry();
}

init();
