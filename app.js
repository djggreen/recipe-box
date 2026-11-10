// Family Recipe Box — static, read-only site. Recipes come from recipes.json in this repository.
// Each recipe has its own link: <site>#/<slug>. Opening that link opens the card directly.

// Paste the Google Form's share link here to show the "Request a recipe" button.
const REQUEST_FORM_URL = "";

(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "text") el.textContent = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
    return el;
  };

  let recipes = [];
  let bySlug = new Map();
  let loaded = false;
  let query = "", activeTag = "";
  let lastPick = null;
  let openedHere = false; // true when this page pushed the recipe link, so Back can return to the list

  // ---------- helpers ----------
  const kcalText = (r) => r.caloriesPerServing ? `≈${Math.round(r.caloriesPerServing)} kcal` : "kcal —";
  const proteinText = (r) => r.proteinPerServing ? `≈${Math.round(r.proteinPerServing)} g protein` : "protein —";
  const gramsText = (r) => r.servingWeightGrams ? `≈${Math.round(r.servingWeightGrams)} g each` : "";
  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
  const safeUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };
  const rand = (n) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const keyOf = (r) => r.slug || r.id;
  const recipeLink = (r) => `${location.origin}${location.pathname}#/${encodeURIComponent(keyOf(r))}`;
  const slugFromHash = () => { const m = /^#\/(.+)$/.exec(location.hash); if (!m) return null; try { return decodeURIComponent(m[1]); } catch { return m[1]; } };

  if (REQUEST_FORM_URL) { const b = $("#requestBtn"); b.href = REQUEST_FORM_URL; b.hidden = false; }

  function filtered() {
    const q = query.trim().toLowerCase();
    return recipes.filter(r => {
      if (activeTag && !(r.tags || []).includes(activeTag)) return false;
      if (!q) return true;
      const hay = [r.title, ...(r.tags || []), ...(r.ingredients || []).map(i => i.item)].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  // ---------- tag filters ----------
  const narrow = matchMedia("(max-width: 640px)");
  function setFiltersOpen(open, remember) {
    $("#chips").hidden = !open;
    $("#filterToggle").setAttribute("aria-expanded", String(open));
    if (remember) { try { localStorage.setItem("filtersOpen", open ? "1" : "0"); } catch {} }
  }
  {
    let saved = null; try { saved = localStorage.getItem("filtersOpen"); } catch {}
    setFiltersOpen(saved == null ? !narrow.matches : saved === "1" && !narrow.matches);
  }
  $("#filterToggle").addEventListener("click", () => setFiltersOpen($("#chips").hidden, true));
  $("#clearTag").addEventListener("click", () => { activeTag = ""; render(); });

  function renderChips() {
    const tags = [...new Set(recipes.flatMap(r => r.tags || []))].sort((a, b) => a.localeCompare(b));
    const box = $("#chips"); box.replaceChildren();
    $("#filterLabel").textContent = activeTag ? `Tag: ${activeTag}` : "Filter by tag";
    $("#filterToggle").classList.toggle("active", !!activeTag);
    $("#filterToggle").hidden = !tags.length;
    $("#clearTag").hidden = !activeTag;
    if (!tags.length) return;
    const mk = (label, val) => h("button", { class: "chip", type: "button", "aria-pressed": String(activeTag === val),
      onclick: () => { activeTag = activeTag === val ? "" : val; if (narrow.matches) setFiltersOpen(false); render(); } }, label);
    box.append(mk("All", ""), ...tags.map(t => mk(t, t)));
  }

  // ---------- list ----------
  function render() {
    renderChips();
    const list = $("#list");
    const items = filtered().sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    $("#count").textContent = loaded ? `${items.length} of ${recipes.length} recipe${recipes.length === 1 ? "" : "s"}` : "";
    $("#slotEyebrow").textContent = (query || activeTag) && loaded ? `Spinning from ${items.length} matching recipe${items.length === 1 ? "" : "s"}` : "What's for dinner?";
    if (!loaded) return;
    if (!recipes.length) {
      list.replaceChildren(h("div", { class: "empty" }, h("h2", { text: "The box is empty" }), h("p", { text: "No recipes have been added yet." })));
      return;
    }
    if (!items.length) {
      list.replaceChildren(h("div", { class: "empty" }, h("h2", { text: "No matches" }), h("p", { text: "Try a different word, or clear the tag filter." })));
      return;
    }
    list.replaceChildren(h("div", { class: "grid" }, items.map(r => h("a", { class: "card", href: `#/${encodeURIComponent(keyOf(r))}`, style: "color:inherit;text-decoration:none" },
      h("h3", { text: r.title || "Untitled recipe" }),
      h("div", { class: "facts" },
        r.servings ? h("span", {}, "Serves ", h("b", { text: String(r.servings) }), r.servingWeightGrams ? ` (${gramsText(r)})` : "") : null,
        h("span", {}, h("b", { text: kcalText(r) }), r.caloriesPerServing ? " /serving" : ""),
        h("span", {}, h("b", { text: proteinText(r) }), r.proteinPerServing ? " /serving" : ""),
        r.totalTime ? h("span", { text: r.totalTime }) : null),
      h("div", { class: "tags" },
        r.needsDetails ? h("span", { class: "tag flag", text: "Link only" }) : null,
        (r.tags || []).slice(0, 4).map(t => h("span", { class: "tag", text: t })))
    ))));
  }

  // ---------- roulette ----------
  let spinning = false;
  $("#spinBtn").addEventListener("click", spin);
  function spin() {
    if (spinning || !loaded) return;
    const pool = filtered();
    const slot = $("#slotText"), meta = $("#slotMeta");
    if (!pool.length) { slot.className = "slot-text idle"; slot.textContent = recipes.length ? "Nothing matches your filter" : "No recipes yet"; meta.replaceChildren(); return; }
    let pick = pool[rand(pool.length)];
    if (pool.length > 1 && lastPick && pick.id === lastPick) pick = pool.filter(r => r.id !== lastPick)[rand(pool.length - 1)];
    lastPick = pick.id;
    meta.replaceChildren();
    const land = () => {
      spinning = false; $("#roulette").classList.remove("spinning"); $("#spinBtn").disabled = false;
      slot.className = "slot-text landed"; slot.textContent = pick.title || "Untitled recipe";
      meta.replaceChildren(
        pick.servings ? h("span", { text: `Serves ${pick.servings}` + (pick.servingWeightGrams ? ` (${gramsText(pick)})` : "") }) : null,
        h("span", { text: kcalText(pick) + (pick.caloriesPerServing ? " per serving" : "") }),
        pick.proteinPerServing ? h("span", { text: proteinText(pick) }) : null,
        h("a", { class: "linkish", href: `#/${encodeURIComponent(keyOf(pick))}` }, "Open recipe →"));
    };
    if (reduced || pool.length === 1) return land();
    spinning = true; $("#roulette").classList.add("spinning"); $("#spinBtn").disabled = true;
    const ticks = 22; let i = 0; let prev = -1;
    const step = () => {
      if (i >= ticks) return land();
      let k = rand(pool.length); if (k === prev && pool.length > 1) k = (k + 1) % pool.length; prev = k;
      slot.className = "slot-text"; void slot.offsetWidth; slot.className = "slot-text tick";
      slot.textContent = pool[k].title || "Untitled recipe";
      i++;
      setTimeout(step, 45 + Math.pow(i / ticks, 2.6) * 320);
    };
    step();
  }

  // ---------- recipe card (routed by the link) ----------
  function closeView() {
    if (openedHere) history.back();
    else { history.replaceState(null, "", location.pathname + location.search); route(); }
  }
  function hideView() { $("#viewOv").hidden = true; document.body.style.overflow = ""; document.title = "Family Recipe Box"; }
  $("#viewOv").addEventListener("click", e => { if (e.target === $("#viewOv")) closeView(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#viewOv").hidden) closeView(); });
  document.addEventListener("click", e => {
    const a = e.target.closest?.('a[href^="#/"]');
    if (a && !e.metaKey && !e.ctrlKey && !e.shiftKey) openedHere = true;
  });
  window.addEventListener("hashchange", route);

  function route() {
    if (!loaded) return;
    const key = slugFromHash();
    if (!key) { openedHere = false; hideView(); return; }
    const r = bySlug.get(key);
    if (!r) {
      hideView();
      const b = $("#banner"); b.hidden = false; b.textContent = "That recipe link points to a recipe that isn't in the box anymore.";
      return;
    }
    $("#banner").hidden = true;
    showRecipe(r);
  }

  function showRecipe(r) {
    const sheet = $("#viewSheet");
    const url = safeUrl(r.sourceUrl);
    const groceryLines = (r.ingredients || []).map(i => [i.quantity, i.item].filter(Boolean).join(" ").trim()).filter(Boolean);
    const groceryText = groceryLines.join("\n");
    const groceryArea = h("textarea", { class: "grocery-text", rows: String(Math.min(8, groceryLines.length || 1)), readonly: true, "aria-label": "Ingredients to copy" });
    groceryArea.value = groceryText;
    const groceryMsg = h("p", { class: "grocery-msg" });
    const groceryPanel = h("div", { class: "grocery", hidden: true },
      groceryMsg, groceryArea,
      h("div", { class: "grocery-actions" }, h("button", { class: "btn ghost", type: "button", onclick: () => { groceryPanel.hidden = true; } }, "Done")),
      h("details", { class: "grocery-help" },
        h("summary", { text: "Set up the shortcut (once)" }),
        h("ol", {},
          h("li", { text: "In the Shortcuts app, open (or create) a shortcut named \"Add to Grocery from Clipboard\"." }),
          h("li", { text: "Make the first action \"Get Clipboard\" (remove any Shortcut Input step)." }),
          h("li", { text: "Add \"Split Text\" and split the Clipboard by New Lines." }),
          h("li", { text: "Add \"Repeat with Each\" for the split text, and inside it \"Add New Reminder\" with the Repeat Item, list set to Grocery." }),
          h("li", { text: "Save. Now tap Add to Grocery list here, then say \"Hey Siri, add to grocery from clipboard\", or tap the shortcut from a Home Screen icon or widget." }))));
    const groceryBtn = groceryLines.length ? h("button", { class: "btn grocery-btn", type: "button", onclick: async () => {
      groceryPanel.hidden = false;
      try {
        await navigator.clipboard.writeText(groceryText);
        groceryMsg.textContent = `Copied ${groceryLines.length} ingredient${groceryLines.length === 1 ? "" : "s"}. Now say "Hey Siri, add to grocery from clipboard" to add each one as its own reminder.`;
      } catch {
        groceryMsg.textContent = "Select the list below and copy it, then say \"Hey Siri, add to grocery from clipboard\" to add each line as its own reminder.";
        groceryArea.focus(); groceryArea.select();
      }
    } }, "Add to Grocery list") : null;

    const link = recipeLink(r);
    const linkField = h("input", { class: "link-field", type: "text", readonly: true, "aria-label": "Link to this recipe" });
    linkField.value = link;
    const linkMsg = h("span", {});
    const linkBox = h("div", { class: "link-box", hidden: true }, linkMsg, linkField);
    const linkBtn = h("button", { class: "btn", type: "button", onclick: async () => {
      linkBox.hidden = false;
      try { await navigator.clipboard.writeText(link); linkMsg.textContent = "Link copied. Paste it into a note or message; opening it brings up this recipe."; }
      catch { linkMsg.textContent = "Copy this link:"; linkField.focus(); linkField.select(); }
    } }, "Copy link");

    sheet.replaceChildren(h("div", { class: "rcard" },
      h("div", { class: "rbar" },
        h("button", { class: "btn ghost", type: "button", onclick: closeView }, "← All recipes"),
        h("div", { class: "rbar-right" }, linkBtn)),
      linkBox,
      h("div", { class: "rhead" },
        h("h2", { text: r.title || "Untitled recipe" }),
        h("div", { class: "tags" }, (r.tags || []).map(t => h("span", { class: "tag", text: t }))),
        url ? h("div", { class: "source" }, "From ", h("a", { href: url, target: "_blank", rel: "noopener noreferrer", text: hostOf(url) || url })) : null),
      h("div", { class: "stats" },
        h("div", { class: "stat" }, h("div", { class: "k", text: "Serves" }), h("div", { class: "v", text: r.servings ? String(r.servings) : "—" })),
        h("div", { class: "stat" }, h("div", { class: "k", text: "Serving size" }), h("div", { class: "v" }, r.servingWeightGrams ? `≈${Math.round(r.servingWeightGrams)}` : "—", r.servingWeightGrams ? h("small", { text: " g est." }) : null)),
        h("div", { class: "stat" }, h("div", { class: "k", text: "Calories / serving" }), h("div", { class: "v" }, r.caloriesPerServing ? `≈${Math.round(r.caloriesPerServing)}` : "—", r.caloriesPerServing ? h("small", { text: " kcal est." }) : null)),
        h("div", { class: "stat" }, h("div", { class: "k", text: "Protein / serving" }), h("div", { class: "v" }, r.proteinPerServing ? `≈${Math.round(r.proteinPerServing)}` : "—", r.proteinPerServing ? h("small", { text: " g est." }) : null)),
        r.totalTime ? h("div", { class: "stat" }, h("div", { class: "k", text: "Time" }), h("div", { class: "v", text: r.totalTime })) : null),
      r.needsDetails ? h("p", { class: "notes", text: "Only the link is saved so far; the full recipe hasn't been filled in yet." }) : null,
      (r.ingredients?.length || r.steps?.length) ? h("div", { class: "cols" },
        h("div", {}, h("div", { class: "ing-head" }, h("h3", { text: "Ingredients" }), groceryBtn), groceryPanel, h("ul", { class: "ing" }, (r.ingredients || []).map(i => h("li", {}, h("span", { class: "q", text: i.quantity || "" }), h("span", { text: i.item || "" }))))),
        h("div", {}, h("h3", { text: "Instructions" }), h("ol", { class: "steps" }, (r.steps || []).map(s => h("li", {}, h("span", { text: s })))))) : null,
      r.notes ? h("p", { class: "notes", text: r.notes }) : null
    ));
    $("#viewOv").hidden = false; document.body.style.overflow = "hidden";
    document.title = `${r.title || "Recipe"} · Family Recipe Box`;
    sheet.scrollTop = 0; $("#viewOv").scrollTop = 0;
  }

  // ---------- search ----------
  const search = $("#search");
  search.addEventListener("input", () => { query = search.value; render(); });
  search.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const q = search.value.trim().toLowerCase(); if (!q) return;
    const items = filtered();
    const pick = items.find(r => (r.title || "").trim().toLowerCase() === q) || (items.length === 1 ? items[0] : null);
    if (pick) { e.preventDefault(); search.blur(); openedHere = true; location.hash = `/${encodeURIComponent(keyOf(pick))}`; }
  });

  // ---------- load ----------
  fetch("recipes.json", { cache: "no-cache" })
    .then(res => { if (!res.ok) throw new Error(res.status); return res.json(); })
    .then(data => {
      recipes = Array.isArray(data) ? data : (data.recipes || []);
      bySlug = new Map();
      for (const r of recipes) { bySlug.set(r.id, r); if (r.slug) bySlug.set(r.slug, r); }
      loaded = true; render(); route();
    })
    .catch(() => {
      const b = $("#banner"); b.hidden = false; b.textContent = "The recipes couldn't be loaded. Check your connection and reload the page.";
      loaded = true; render();
    });
})();
