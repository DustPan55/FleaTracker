/* FleaTracker — flea & tick treatment log for the pack. */
(() => {
  "use strict";

  const cfg = window.FLEA_CONFIG;
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);

  // ---- state ----
  let dogs = [];
  let products = [];
  let treatments = [];
  let editingId = null; // id of the treatment currently being edited, or null

  // ---- elements ----
  const $ = (id) => document.getElementById(id);
  const dashboard = $("dashboard");
  const historyEl = $("history");
  const form = $("treatment-form");
  const fDog = $("f-dog");
  const fProduct = $("f-product");
  const fInterval = $("f-interval");
  const fDate = $("f-date");
  const fDose = $("f-dose");
  const fNotes = $("f-notes");
  const fSubmit = $("f-submit");
  const fCancel = $("f-cancel");
  const formCard = document.querySelector(".form-card");
  const formTitle = $("form-title");
  const formMsg = $("form-msg");
  const historyFilter = $("history-filter");

  // ---- helpers ----
  const todayISO = () => new Date().toISOString().slice(0, 10);

  function daysBetween(aISO, bISO) {
    const ms = new Date(bISO + "T00:00:00") - new Date(aISO + "T00:00:00");
    return Math.round(ms / 86400000);
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function setStatus(ok, text) {
    $("status-dot").className = "dot " + (ok ? "ok" : "err");
    $("status-text").textContent = text;
  }

  // Latest treatment per dog → protection status
  function statusFor(dogId) {
    const list = treatments
      .filter((t) => t.dog_id === dogId)
      .sort((a, b) => b.date_given.localeCompare(a.date_given));
    if (!list.length) return { cls: "none", badge: "No record", latest: null };

    const latest = list[0];
    if (!latest.next_due) return { cls: "ok", badge: "Logged", latest };

    const diff = daysBetween(todayISO(), latest.next_due); // >0 future, <0 past
    if (diff < 0) return { cls: "over", badge: "Overdue", latest, diff };
    if (diff <= 7) return { cls: "soon", badge: "Due soon", latest, diff };
    return { cls: "ok", badge: "Protected", latest, diff };
  }

  // ---- renderers ----
  function renderDashboard() {
    if (!dogs.length) { dashboard.innerHTML = '<div class="empty">No dogs yet.</div>'; return; }
    dashboard.innerHTML = dogs.map((d) => {
      const s = statusFor(d.id);
      let detail;
      if (!s.latest) {
        detail = '<span class="label">No treatments logged yet.</span>';
      } else {
        const due = s.latest.next_due
          ? `<div><span class="label">Next due:</span> <span class="due">${fmtDate(s.latest.next_due)}</span>` +
            (s.diff < 0 ? ` (${Math.abs(s.diff)}d ago)` : s.diff === 0 ? " (today)" : ` (in ${s.diff}d)`) + "</div>"
          : "";
        detail =
          `<div><span class="label">Last:</span> ${s.latest.product_name} · ${fmtDate(s.latest.date_given)}</div>` + due;
      }
      return `
        <div class="dog-card ${s.cls}">
          <div class="dog-top">
            <div>
              <div class="dog-name">${d.sex === "M" ? "♂" : "♀"} ${d.name}</div>
              <div class="dog-breed">${d.breed || ""}</div>
            </div>
            <span class="badge ${s.cls}">${s.badge}</span>
          </div>
          <div class="dog-detail">${detail}</div>
        </div>`;
    }).join("");
  }

  function renderHistory() {
    const filter = historyFilter.value;
    const rows = treatments
      .filter((t) => !filter || t.dog_id === filter)
      .sort((a, b) => b.date_given.localeCompare(a.date_given) || b.created_at.localeCompare(a.created_at));

    if (!rows.length) { historyEl.innerHTML = '<div class="empty">No treatments logged yet.</div>'; return; }

    const nameOf = (id) => (dogs.find((d) => d.id === id) || {}).name || "—";
    historyEl.innerHTML = rows.map((t) => {
      const meta = [t.dose, t.notes].filter(Boolean).join(" · ");
      const due = t.next_due ? ` · next ${fmtDate(t.next_due)}` : "";
      return `
        <div class="h-row${t.id === editingId ? " editing" : ""}">
          <div class="h-dog">${nameOf(t.dog_id)}</div>
          <div class="h-main">
            <span class="h-prod">${t.product_name}</span>
            <div class="h-meta">${meta}${due ? `<span>${due}</span>` : ""}</div>
          </div>
          <div class="h-date">${fmtDate(t.date_given)}</div>
          <button class="h-edit" data-id="${t.id}" title="Edit">✏️</button>
          <button class="h-del" data-id="${t.id}" title="Delete">🗑</button>
        </div>`;
    }).join("");

    historyEl.querySelectorAll(".h-edit").forEach((btn) =>
      btn.addEventListener("click", () => startEdit(btn.dataset.id))
    );
    historyEl.querySelectorAll(".h-del").forEach((btn) =>
      btn.addEventListener("click", () => deleteTreatment(btn.dataset.id))
    );
  }

  function fillSelects() {
    fDog.innerHTML = dogs.map((d) => `<option value="${d.id}">${d.name}</option>`).join("");
    historyFilter.innerHTML =
      '<option value="">All dogs</option>' + dogs.map((d) => `<option value="${d.id}">${d.name}</option>`).join("");
    fProduct.innerHTML = products
      .map((p) => `<option value="${p.name}" data-interval="${p.interval_days ?? ""}" data-kind="${p.kind ?? ""}">${p.name}</option>`)
      .join("");
    syncIntervalFromProduct();
  }

  function syncIntervalFromProduct() {
    const opt = fProduct.selectedOptions[0];
    if (opt && opt.dataset.interval !== "") fInterval.value = opt.dataset.interval;
    else fInterval.value = "";
  }

  // ---- data ops ----
  async function loadAll() {
    const [dRes, pRes, tRes] = await Promise.all([
      sb.from("flea_dogs").select("*").order("sort_order"),
      sb.from("flea_products").select("*").eq("active", true).order("name"),
      sb.from("flea_treatments").select("*"),
    ]);
    if (dRes.error || pRes.error || tRes.error) {
      setStatus(false, "Could not load data — check connection.");
      console.error(dRes.error || pRes.error || tRes.error);
      return;
    }
    dogs = dRes.data;
    products = pRes.data;
    treatments = tRes.data;
    fillSelects();
    renderDashboard();
    renderHistory();
    setStatus(true, `${dogs.length} dogs · ${treatments.length} treatments logged`);
  }

  // Select a product option by name, adding a temporary one if it's not in the list
  function selectProductByName(name) {
    let match = Array.from(fProduct.options).find((o) => o.value === name);
    if (!match) {
      match = new Option(name, name);
      fProduct.add(match);
    }
    fProduct.value = name;
  }

  function startEdit(id) {
    const t = treatments.find((x) => x.id === id);
    if (!t) return;
    editingId = id;
    fDog.value = t.dog_id;
    selectProductByName(t.product_name);
    fInterval.value = t.interval_days ?? "";
    fDate.value = t.date_given;
    fDose.value = t.dose || "";
    fNotes.value = t.notes || "";

    formCard.classList.add("editing");
    formTitle.textContent = "✏️ Edit treatment";
    fSubmit.textContent = "Update treatment";
    fCancel.hidden = false;
    formMsg.className = "form-msg";
    formMsg.textContent = "";
    renderHistory();
    formCard.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function cancelEdit() {
    editingId = null;
    formCard.classList.remove("editing");
    formTitle.textContent = "➕ Log a treatment";
    fSubmit.textContent = "Save treatment";
    fCancel.hidden = true;
    form.reset();
    fDate.value = todayISO();
    syncIntervalFromProduct();
    formMsg.className = "form-msg";
    formMsg.textContent = "";
    renderHistory();
  }

  async function submitForm(e) {
    e.preventDefault();
    fSubmit.disabled = true;
    formMsg.className = "form-msg";
    formMsg.textContent = "";

    const opt = fProduct.selectedOptions[0];
    const interval = fInterval.value === "" ? null : parseInt(fInterval.value, 10);
    const record = {
      dog_id: fDog.value,
      product_name: fProduct.value,
      kind: opt ? opt.dataset.kind || null : null,
      date_given: fDate.value || todayISO(),
      interval_days: Number.isNaN(interval) ? null : interval,
      dose: fDose.value.trim() || null,
      notes: fNotes.value.trim() || null,
    };

    let data, error;
    if (editingId) {
      ({ data, error } = await sb.from("flea_treatments").update(record).eq("id", editingId).select().single());
    } else {
      ({ data, error } = await sb.from("flea_treatments").insert(record).select().single());
    }
    fSubmit.disabled = false;
    if (error) {
      formMsg.className = "form-msg err";
      formMsg.textContent = "Error: " + error.message;
      return;
    }

    const dogName = (dogs.find((d) => d.id === data.dog_id) || {}).name || "dog";
    if (editingId) {
      const i = treatments.findIndex((x) => x.id === editingId);
      if (i !== -1) treatments[i] = data;
      cancelEdit();
      formMsg.className = "form-msg ok";
      formMsg.textContent = `✓ Updated ${dogName}'s entry`;
    } else {
      treatments.push(data);
      fDose.value = "";
      fNotes.value = "";
      formMsg.className = "form-msg ok";
      formMsg.textContent = `✓ Saved for ${dogName}`;
    }
    renderDashboard();
    renderHistory();
    setStatus(true, `${dogs.length} dogs · ${treatments.length} treatments logged`);
    setTimeout(() => { formMsg.textContent = ""; formMsg.className = "form-msg"; }, 4000);
  }

  async function deleteTreatment(id) {
    const t = treatments.find((x) => x.id === id);
    if (!t) return;
    if (!confirm(`Delete this ${t.product_name} entry?`)) return;
    const { error } = await sb.from("flea_treatments").delete().eq("id", id);
    if (error) { alert("Could not delete: " + error.message); return; }
    treatments = treatments.filter((x) => x.id !== id);
    if (editingId === id) cancelEdit();
    renderDashboard();
    renderHistory();
    setStatus(true, `${dogs.length} dogs · ${treatments.length} treatments logged`);
  }

  // ---- wire up ----
  fDate.value = todayISO();
  fProduct.addEventListener("change", syncIntervalFromProduct);
  historyFilter.addEventListener("change", renderHistory);
  form.addEventListener("submit", submitForm);
  fCancel.addEventListener("click", cancelEdit);

  loadAll();
})();
