// Edge Saver v242
// Owner Push Notifications are loaded only after the Owner explicitly opens them.
// This file performs zero Supabase/database requests.

let loaded = false;
let loading = false;

function ownerUi() {
  return document.documentElement.classList.contains("admin-red-theme")
    || document.body?.classList.contains("admin-red-theme");
}

function findNav() {
  return document.querySelector("#nav");
}

function addLazyButton() {
  if (!ownerUi() || loaded || loading) return;
  const nav = findNav();
  if (!nav || nav.querySelector("[data-admin-push-lazy]") || nav.querySelector("[data-admin-push-nav]")) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "admin-push-nav";
  btn.dataset.adminPushLazy = "1";
  btn.innerHTML = `<span>🔔</span><span>Push notifications</span>`;

  const inbox = [...nav.querySelectorAll("button")].find((b) => /inbox/i.test(b.textContent || ""));
  nav.insertBefore(btn, inbox || null);

  btn.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (loading || loaded) return;

    loading = true;
    btn.disabled = true;
    btn.innerHTML = `<span>🔔</span><span>Opening…</span>`;

    try {
      // Remove the placeholder first so the real module can create its own button.
      btn.remove();

      await import("./admin-push-center-v233.js?v=1.0.242");
      loaded = true;

      // The real module does its Owner/profile/capability reads now — only
      // because the Owner deliberately requested this feature.
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const real = document.querySelector("[data-admin-push-nav]");
        if (real) {
          real.click();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      throw new Error("Push notification center did not finish opening.");
    } catch (error) {
      console.warn("Push notification center could not open", error);
      loaded = false;
      alert(error?.message || "Could not open Push notifications.");
      addLazyButton();
    } finally {
      loading = false;
    }
  });
}

const nav = findNav();
if (nav) {
  new MutationObserver(addLazyButton).observe(nav, { childList: true, subtree: true });
}
window.addEventListener("hashchange", () => setTimeout(addLazyButton, 50));
setTimeout(addLazyButton, 80);
