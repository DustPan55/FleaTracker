/* FleaTracker — flea & tick treatment log for the pack. */
(() => {
  "use strict";

  const cfg = window.FLEA_CONFIG;
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);

  const OTHER = "__other__"; // sentinel for manual dosage entry

  // ---- state ----
  let dogs = [];
  let products = [];
  let doses = [];       // standard weight-band dosing options
  let treatments = [];
  let editingId = null; // id of the treatment being edited, or null

  // ---- elements ----
  const $ = (id) => document.getElementById(id);
  const dashboard = $("dashboard");
  const historyEl = $("history");
  const form = $("treatment-form");
  const fDog = $("f-dog");
  const fProduct = $("f-product");
  const fInterval = $("f-interval");
  const fDate = $("f-date");
  const fWeight = $("f-weight");
  const fDosage = $("f-dosage");
  const fDose = $("f-dose");           // custom dosage text
  const customDoseRow = $("custom-dose-row");
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

  const num = (n) => Number(n).toString();

  // Build the display label for a dosing band (must match values stored in dose)
  function doseLabel(d) {
    let band;
    if (d.weight_min == null && d.weight_max == null) band = "Any weight";
    else if (d.weight_min == null) band = `≤${num(d.weight_max)} lbs`;
    else if (d.weight_max == null) band = `${num(d.weight_min)}+ lbs`;
    else band = `${num(d.weight_min)}–${num(d.weight_max)} lbs`;
    return d.strength ? `${band} · ${d.strength}` : band;
  }

  const dosesFor = (productName) =>
    doses.filter((d) => d.product_name === productName)
         .sort((a, b) => a.sort_order - b.sort_order);

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
      const bits = [
        t.weight_lbs != null ? `${num(t.weight_lbs)} lbs` : null,
        t.dose,
        t.notes,
      ].filter(Boolean);
      const due = t.next_due ? `next ${fmtDate(t.next_due)}` : null;
      const metaLine = [bits.join(" · "), due].filter(Boolean).join(" · ");
      return `
        <div class="h-row${t.id === editingId ? " editing" : ""}">
          <div class="h-dog">${nameOf(t.dog_id)}</div>
          <div class="h-main">
            <span class="h-prod">${t.product_name}</span>
            <div class="h-meta">${metaLine}</div>
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
    onProductChange();
  }

  // ---- dosage handling ----
  function buildDosageOptions(productName) {
    const opts = dosesFor(productName);
    let html = '<option value="">— none / not sure —</option>';
    html += opts.map((d) => {
      const label = doseLabel(d);
      return `<option value="${label}" data-min="${d.weight_min ?? ""}" data-max="${d.weight_max ?? ""}">${label}</option>`;
    }).join("");
    html += `<option value="${OTHER}">Other / type in…</option>`;
    fDosage.innerHTML = html;
  }

  // Auto-pick the band matching the entered weight, if any
  function suggestDosageFromWeight() {
    const w = parseFloat(fWeight.value);
    if (Number.isNaN(w)) return;
    const match = Array.from(fDosage.options).find((o) => {
      if (!o.value || o.value === OTHER) return false;
      const min = o.dataset.min === "" ? null : parseFloat(o.dataset.min);
      const max = o.dataset.max === "" ? null : parseFloat(o.dataset.max);
      return (min == null || w >= min) && (max == null || w <= max);
    });
    if (match) { fDosage.value = match.value; toggleCustomDose(); }
  }

  function toggleCustomDose() {
    const isOther = fDosage.value === OTHER;
    customDoseRow.hidden = !isOther;
    if (!isOther) fDose.value = "";
  }

  function onProductChange() {
    syncIntervalFromProduct();
    buildDosageOptions(fProduct.value);
    suggestDosageFromWeight();
    toggleCustomDose();
  }

  function syncIntervalFromProduct() {
    const opt = fProduct.selectedOptions[0];
    if (opt && opt.dataset.interval !== "") fInterval.value = opt.dataset.interval;
    else fInterval.value = "";
  }

  // Resolve the dose string the user chose (band label, typed text, or null)
  function chosenDose() {
    if (fDosage.value === OTHER) return fDose.value.trim() || null;
    return fDosage.value || null;
  }

  // ---- data ops ----
  async function loadAll() {
    const [dRes, pRes, doseRes, tRes] = await Promise.all([
      sb.from("flea_dogs").select("*").order("sort_order"),
      sb.from("flea_products").select("*").eq("active", true).order("name"),
      sb.from("flea_product_doses").select("*"),
      sb.from("flea_treatments").select("*"),
    ]);
    if (dRes.error || pRes.error || doseRes.error || tRes.error) {
      setStatus(false, "Could not load data — check connection.");
      console.error(dRes.error || pRes.error || doseRes.error || tRes.error);
      return;
    }
    dogs = dRes.data;
    products = pRes.data;
    doses = doseRes.data;
    treatments = tRes.data;
    fillSelects();
    renderDashboard();
    renderHistory();
    setStatus(true, `${dogs.length} dogs · ${treatments.length} treatments logged`);
  }

  async function submitForm(e) {
    e.preventDefault();
    fSubmit.disabled = true;
    formMsg.className = "form-msg";
    formMsg.textContent = "";

    const opt = fProduct.selectedOptions[0];
    const interval = fInterval.value === "" ? null : parseInt(fInterval.value, 10);
    const weight = fWeight.value === "" ? null : parseFloat(fWeight.value);
    const record = {
      dog_id: fDog.value,
      product_name: fProduct.value,
      kind: opt ? opt.dataset.kind || null : null,
      date_given: fDate.value || todayISO(),
      interval_days: Number.isNaN(interval) ? null : interval,
      weight_lbs: Number.isNaN(weight) ? null : weight,
      dose: chosenDose(),
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
      fNotes.value = "";
      formMsg.className = "form-msg ok";
      formMsg.textContent = `✓ Saved for ${dogName}`;
    }
    renderDashboard();
    renderHistory();
    setStatus(true, `${dogs.length} dogs · ${treatments.length} treatments logged`);
    setTimeout(() => { formMsg.textContent = ""; formMsg.className = "form-msg"; }, 4000);
  }

  // ---- edit ----
  function selectOrAdd(select, value) {
    if (!Array.from(select.options).some((o) => o.value === value)) {
      select.add(new Option(value, value));
    }
    select.value = value;
  }

  function startEdit(id) {
    const t = treatments.find((x) => x.id === id);
    if (!t) return;
    editingId = id;
    fDog.value = t.dog_id;
    selectOrAdd(fProduct, t.product_name);
    syncIntervalFromProduct();
    if (t.interval_days != null) fInterval.value = t.interval_days;
    fDate.value = t.date_given;
    fWeight.value = t.weight_lbs ?? "";

    // dosage: match a known band, else fall back to custom text
    buildDosageOptions(t.product_name);
    if (t.dose && Array.from(fDosage.options).some((o) => o.value === t.dose)) {
      fDosage.value = t.dose;
    } else if (t.dose) {
      fDosage.value = OTHER;
      fDose.value = t.dose;
    } else {
      fDosage.value = "";
    }
    toggleCustomDose();

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
    onProductChange();
    formMsg.className = "form-msg";
    formMsg.textContent = "";
    renderHistory();
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
  fProduct.addEventListener("change", onProductChange);
  fWeight.addEventListener("input", suggestDosageFromWeight);
  fDosage.addEventListener("change", toggleCustomDose);
  historyFilter.addEventListener("change", renderHistory);
  form.addEventListener("submit", submitForm);
  fCancel.addEventListener("click", cancelEdit);

  loadAll();
})();
