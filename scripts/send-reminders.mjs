// Daily flea/tick dose reminder — runs in GitHub Actions.
// Reads the Supabase data, finds dogs due within LEAD_DAYS (or overdue),
// and emails a single digest via Resend. No-ops when nothing is due.

const SUPABASE_URL   = process.env.SUPABASE_URL;
const SUPABASE_KEY   = process.env.SUPABASE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const TO             = process.env.REMIND_TO;
const LEAD_DAYS      = parseInt(process.env.LEAD_DAYS || "3", 10);
const DRY_RUN        = process.env.DRY_RUN === "1";
const APP_URL        = "https://dustpan55.github.io/FleaTracker/";

if (!RESEND_API_KEY && !DRY_RUN) {
  console.log("No RESEND_API_KEY set yet — skipping (add the secret to enable emails).");
  process.exit(0);
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) =>
  Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000);

async function sb(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!r.ok) throw new Error(`Supabase ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

const [dogs, treatments] = await Promise.all([
  sb("flea_dogs?select=*&order=sort_order"),
  sb("flea_treatments?select=*"),
]);

const today = todayISO();
const due = [];
for (const d of dogs) {
  const latest = treatments
    .filter((t) => t.dog_id === d.id)
    .sort((a, b) => b.date_given.localeCompare(a.date_given))[0];
  if (!latest || !latest.next_due) continue; // no record / no interval → nothing to remind
  const diff = daysBetween(today, latest.next_due); // >0 future · 0 today · <0 overdue
  if (diff <= LEAD_DAYS) {
    due.push({ name: d.name, product: latest.product_name, next_due: latest.next_due, diff });
  }
}

if (!due.length) {
  console.log("Nothing due within window; no email sent.");
  process.exit(0);
}

due.sort((a, b) => a.diff - b.diff); // most overdue first

const phrase = (diff) =>
  diff < 0 ? `${Math.abs(diff)} day${Math.abs(diff) === 1 ? "" : "s"} overdue`
  : diff === 0 ? "due today"
  : `due in ${diff} day${diff === 1 ? "" : "s"}`;
const color = (diff) => (diff < 0 ? "#c0392b" : diff === 0 ? "#b9770a" : "#2e7d4f");
const fmt = (iso) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US",
    { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const rows = due.map((x) =>
  `<tr>
     <td style="padding:6px 14px 6px 0;font-weight:600">${x.name}</td>
     <td style="padding:6px 14px 6px 0">${x.product}</td>
     <td style="padding:6px 14px 6px 0">${fmt(x.next_due)}</td>
     <td style="padding:6px 0;color:${color(x.diff)};font-weight:600">${phrase(x.diff)}</td>
   </tr>`).join("");

const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2a26;max-width:520px">
  <h2 style="color:#2f5d50">🐾 Flea &amp; tick reminder</h2>
  <p>${due.length} dog${due.length === 1 ? "" : "s"} need attention:</p>
  <table style="border-collapse:collapse;font-size:14px">${rows}</table>
  <p style="margin-top:18px">
    <a href="${APP_URL}" style="background:#2f5d50;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Open the tracker to log a dose</a>
  </p>
  <p style="font-size:12px;color:#6b7a74">You'll get a daily nudge until you log the next dose for each dog (logging it clears the reminder automatically).</p>
</div>`;

const text =
  `🐾 Flea & tick reminder — ${due.length} dog(s) due:\n\n` +
  due.map((x) => `• ${x.name}: ${x.product} — ${phrase(x.diff)} (${fmt(x.next_due)})`).join("\n") +
  `\n\nLog a dose: ${APP_URL}`;

const subject = `🐾 Flea/tick: ${due.length} dog${due.length === 1 ? "" : "s"} due`;

if (DRY_RUN) {
  console.log("DRY RUN — would send:\n");
  console.log("Subject:", subject);
  console.log(text);
  process.exit(0);
}

const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ from: "FleaTracker <onboarding@resend.dev>", to: [TO], subject, html, text }),
});
if (!res.ok) {
  console.error("Resend error:", res.status, await res.text());
  process.exit(1);
}
console.log(`Sent reminder for ${due.length} dog(s) to ${TO}.`);
