/**
 * Nova Dots AI Studio — chat, Dots agency, document studio.
 * Runs fully in the browser. Data + API key stay in localStorage.
 */
const KEY = "nova_dots_state_v2";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const uid = (p) => p + "_" + Date.now() + Math.random().toString(36).slice(2, 6);

const FMT_CAT = { EXECUTIVE_SUMMARY: "Summary", STUDY_GUIDE: "Study Guide", PROFESSIONAL_REPORT: "Report", CLEAN_MARKDOWN: "Report", JSON_DATA: "Data", MEMO: "Memo" };
const FMT_LABEL = { EXECUTIVE_SUMMARY: "Executive summary", STUDY_GUIDE: "Study guide", PROFESSIONAL_REPORT: "Report", CLEAN_MARKDOWN: "Markdown", JSON_DATA: "JSON", MEMO: "Memo" };

let S = {
  pro: false, apiKey: "", modelFree: "gemini-2.5-flash", modelPro: "gemini-2.5-pro",
  dotsOn: true, currentId: null, conversations: [], documents: [], tasks: [], logs: []
};
let attachment = null; // {name, mime, data (base64) | text, preview}
let taskFilter = "all", docCat = "All", busy = false;
const running = new Set();

/* ---------- State ---------- */
function load() {
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { console.warn(e); }
  if (!S.conversations.length) newChat(true);
  if (!S.currentId || !S.conversations.find((c) => c.id === S.currentId)) S.currentId = S.conversations[0].id;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast("Storage full — delete old chats or documents."); }
}
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2600);
}
function log(action, details) {
  S.logs.unshift({ time: new Date().toLocaleTimeString(), action, details });
  S.logs.length = Math.min(S.logs.length, 60);
  save(); renderLogs();
}

/* ---------- Markdown (safe: escapes first) ---------- */
function md(src) {
  const blocks = [];
  let t = esc(src).replace(/```(\w*)\n?([\s\S]*?)```/g, (_, l, c) => { blocks.push(`<pre><code>${c.trim()}</code></pre>`); return `\u0000${blocks.length - 1}\u0000`; });
  const inline = (x) => x.replace(/`([^`\n]+)`/g, "<code>$1</code>").replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const out = []; let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  t.split("\n").forEach((line) => {
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)/))) { close(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); }
    else if ((m = line.match(/^\s*[-*•]\s+(.*)/))) { if (list !== "ul") { close(); out.push("<ul>"); list = "ul"; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== "ol") { close(); out.push("<ol>"); list = "ol"; } out.push(`<li>${inline(m[1])}</li>`); }
    else if (!line.trim()) close();
    else { close(); out.push(`<p>${inline(line)}</p>`); }
  });
  close();
  return out.join("").replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[i]);
}

/* ---------- Gemini ---------- */
async function gemini(contents, system) {
  if (!S.apiKey) { openSettings(); throw new Error("Add your Gemini API key in Settings first."); }
  const model = S.pro ? S.modelPro : S.modelFree;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const body = { contents };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  let res;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": S.apiKey }, body: JSON.stringify(body) });
  } catch { throw new Error("Network error. Check your connection."); }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).error.message || msg; } catch {}
    throw new Error(msg);
  }
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  if (!text) throw new Error(data.promptFeedback?.blockReason ? "Blocked: " + data.promptFeedback.blockReason : "Empty response.");
  return text;
}
const ask = (prompt, system) => gemini([{ role: "user", parts: [{ text: prompt }] }], system);

/* ---------- Chat ---------- */
const conv = () => S.conversations.find((c) => c.id === S.currentId);

function newChat(silent) {
  const c = { id: uid("conv"), title: "New chat", messages: [] };
  S.conversations.unshift(c); S.currentId = c.id;
  if (!silent) { save(); renderConvs(); renderMessages(); switchView("viewChat"); closeSidebar(); $("chatInput").focus(); }
}

function renderConvs() {
  const box = $("convList"); box.innerHTML = "";
  S.conversations.forEach((c) => {
    const el = document.createElement("div");
    el.className = "conv" + (c.id === S.currentId ? " active" : "");
    el.innerHTML = `<span>${esc(c.title)}</span><button title="Delete">✕</button>`;
    el.onclick = () => { S.currentId = c.id; save(); renderConvs(); renderMessages(); switchView("viewChat"); closeSidebar(); };
    el.querySelector("button").onclick = (e) => {
      e.stopPropagation();
      if (!confirm("Delete this chat?")) return;
      S.conversations = S.conversations.filter((x) => x.id !== c.id);
      if (!S.conversations.length) newChat(true);
      if (S.currentId === c.id) S.currentId = S.conversations[0].id;
      save(); renderConvs(); renderMessages();
    };
    box.appendChild(el);
  });
}

function renderMessages(typing) {
  const box = $("messages"); box.innerHTML = "";
  const c = conv();
  if (!c.messages.length && !typing) {
    box.innerHTML = `<div class="empty"><h3>What can I help with?</h3><p>Chat, attach photos or documents, or put Dots to work in the 24/7 tab.</p></div>`;
    return;
  }
  c.messages.forEach((m, i) => {
    const u = m.sender === "USER";
    const el = document.createElement("div");
    el.className = "msg " + (u ? "user" : "assistant");
    el.innerHTML = `${u ? "" : '<div class="avatar">✦</div>'}<div class="bubble">
      ${u ? "" : '<button class="copy">Copy</button>'}
      ${m.image ? `<img src="${m.image}" alt="attachment">` : ""}
      <div class="md">${md(m.text)}</div><div class="time">${esc(m.time)}</div></div>`;
    const cp = el.querySelector(".copy");
    if (cp) cp.onclick = () => { navigator.clipboard.writeText(m.text); toast("Copied"); };
    box.appendChild(el);
  });
  if (typing) {
    const el = document.createElement("div");
    el.className = "msg assistant";
    el.innerHTML = `<div class="avatar">✦</div><div class="bubble"><div class="typing"><i></i><i></i><i></i></div></div>`;
    box.appendChild(el);
  }
  box.scrollTop = box.scrollHeight;
}

async function sendMessage() {
  if (busy) return;
  const input = $("chatInput");
  const text = input.value.trim();
  if (!text && !attachment) return;
  const c = conv();
  const att = attachment;
  c.messages.push({ id: uid("m"), sender: "USER", text: text || `[Attached: ${att.name}]`, image: att?.preview || null, time: now() });
  if (c.title === "New chat") c.title = (text || att.name).slice(0, 40);

  // Build multi-turn history (last 20 messages), attachment only on the newest turn
  const hist = c.messages.slice(-20).filter((m) => !m.error);
  const contents = hist.map((m, i) => {
    const parts = [{ text: m.text }];
    if (i === hist.length - 1 && att) {
      if (att.text != null) parts.unshift({ text: `--- ATTACHED DOCUMENT: ${att.name} ---\n${att.text}\n--- END ---\n\n` });
      else parts.push({ inlineData: { mimeType: att.mime, data: att.data } });
    }
    return { role: m.sender === "USER" ? "user" : "model", parts };
  });
  while (contents.length && contents[0].role !== "user") contents.shift();

  input.value = ""; input.style.height = "auto"; clearAttachment();
  busy = true; $("btnSend").disabled = true;
  save(); renderConvs(); renderMessages(true);
  try {
    const reply = await gemini(contents, "You are Nova Dots, a helpful, accurate AI assistant. Be clear and well-structured; use Markdown.");
    c.messages.push({ id: uid("m"), sender: "ASSISTANT", text: reply, time: now() });
  } catch (err) {
    c.messages.push({ id: uid("m"), sender: "ASSISTANT", text: "⚠️ " + err.message, time: now(), error: true });
  }
  busy = false; $("btnSend").disabled = false;
  save(); renderMessages();
}

/* ---------- Attachments ---------- */
function setAttachment(a) {
  attachment = a;
  $("attachName").textContent = "📎 " + a.name;
  $("attachStrip").classList.remove("hidden");
}
function clearAttachment() { attachment = null; $("attachStrip").classList.add("hidden"); $("fileInput").value = ""; }

function handleFile(file) {
  if (!file) return;
  if (file.size > 15 * 1024 * 1024) return toast("File too large (max 15 MB).");
  const isBin = file.type.startsWith("image/") || file.type === "application/pdf";
  const r = new FileReader();
  r.onload = () => {
    if (isBin) {
      const url = r.result;
      setAttachment({ name: file.name, mime: file.type, data: url.split(",")[1], preview: file.type.startsWith("image/") ? url : null });
    } else setAttachment({ name: file.name, mime: "text/plain", text: r.result });
  };
  isBin ? r.readAsDataURL(file) : r.readAsText(file);
}

/* ---------- Agency ---------- */
function renderTasks() {
  const box = $("tasks"); box.innerHTML = "";
  $("stActive").textContent = S.tasks.filter((t) => t.status === "ACTIVE").length;
  $("stRuns").textContent = S.tasks.reduce((n, t) => n + (t.runs || 0), 0);
  $("stDocs").textContent = S.documents.length;
  const list = S.tasks.filter((t) => taskFilter === "all" || t.status === taskFilter);
  if (!list.length) { box.innerHTML = `<div class="empty-grid">No responsibilities here yet.</div>`; return; }
  list.forEach((t) => {
    const el = document.createElement("div");
    el.className = "card";
    const sched = t.every ? `every ${t.every >= 1440 ? "day" : t.every >= 60 ? t.every / 60 + "h" : t.every + "m"}` : "manual";
    el.innerHTML = `<div class="top"><span class="tag ${esc(t.priority)}">${esc(t.priority)}</span><span class="tag ${esc(t.status)}">${esc(t.status)}</span></div>
      <h4>${esc(t.title)}</h4><p>${esc(t.description)}</p>
      ${t.result ? `<p><b>Latest:</b> ${esc(t.result)}</p>` : ""}
      <div class="acts"><small>${esc(FMT_LABEL[t.format] || t.format)} · ${sched}${t.runs ? " · " + t.runs + " runs" : ""}</small>
        <button class="btn sm" data-a="run">${running.has(t.id) ? "Running…" : "Run"}</button>
        <button class="btn sm ghost" data-a="pause">${t.status === "PAUSED" ? "Resume" : "Pause"}</button>
        <button class="btn sm danger" data-a="del">✕</button></div>`;
    el.querySelector('[data-a="run"]').onclick = () => runTask(t);
    el.querySelector('[data-a="pause"]').onclick = () => { t.status = t.status === "PAUSED" ? "ACTIVE" : "PAUSED"; log("TASK", `${t.title} → ${t.status}`); save(); renderTasks(); };
    el.querySelector('[data-a="del"]').onclick = () => { if (confirm("Delete this responsibility?")) { S.tasks = S.tasks.filter((x) => x.id !== t.id); save(); renderTasks(); } };
    box.appendChild(el);
  });
}

async function runTask(t, auto) {
  if (running.has(t.id)) return;
  running.add(t.id); renderTasks();
  log(auto ? "AUTO_RUN" : "RUN", t.title);
  try {
    const out = await ask(`Responsibility: ${t.title}\nInstructions: ${t.description}\nProduce a complete deliverable as: ${FMT_LABEL[t.format] || t.format}.`,
      "You are Dots, an autonomous AI agency. Produce complete, professional deliverables.");
    t.runs = (t.runs || 0) + 1; t.lastRun = Date.now(); t.result = out.replace(/\s+/g, " ").slice(0, 160) + "…";
    if (!t.every) t.status = "COMPLETED";
    S.documents.unshift({ id: uid("doc"), title: `${t.title} (#${t.runs})`, source: "AGENCY", format: t.format, category: FMT_CAT[t.format] || "Report", date: new Date().toLocaleDateString(), content: out });
    log("DONE", `Deliverable saved to Docs: ${t.title}`);
    if (!auto) toast("Deliverable saved to Docs");
  } catch (err) { log("ERROR", `${t.title}: ${err.message}`); toast(err.message); }
  running.delete(t.id); save(); renderTasks(); renderDocs();
}

// Scheduler: checks every minute (only works while this tab is open)
setInterval(() => {
  if (!S.dotsOn || !S.apiKey) return;
  S.tasks.forEach((t) => { if (t.status === "ACTIVE" && t.every && Date.now() - (t.lastRun || t.created || 0) >= t.every * 60000) runTask(t, true); });
}, 60000);

function renderLogs() {
  const f = $("logsFeed"); if (!f) return;
  f.innerHTML = S.logs.length ? S.logs.map((l) => `<div><i>${esc(l.time)}</i> <b>[${esc(l.action)}]</b> ${esc(l.details)}</div>`).join("") : "<div>No activity yet.</div>";
}

function applyDots() {
  $("chkMaster").checked = S.dotsOn;
  const chip = $("dotsChip");
  chip.classList.toggle("paused", !S.dotsOn);
  chip.querySelector("span").textContent = S.dotsOn ? "Dots 24/7: ACTIVE" : "Dots: PAUSED";
  $("agencySub").textContent = S.dotsOn ? "Running scheduled responsibilities while this tab is open." : "Paused. Scheduled runs are on hold.";
}

/* ---------- Docs ---------- */
function renderDocs() {
  const box = $("docs"); box.innerHTML = "";
  const q = $("docSearch").value.toLowerCase();
  const list = S.documents.filter((d) => (docCat === "All" || d.category === docCat) && (!q || d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q)));
  $("stDocs").textContent = S.documents.length;
  if (!list.length) { box.innerHTML = `<div class="empty-grid">No documents found.</div>`; return; }
  list.forEach((d) => {
    const el = document.createElement("div");
    el.className = "card"; el.style.cursor = "pointer";
    el.innerHTML = `<div class="top"><span class="tag">${esc(FMT_LABEL[d.format] || d.format)}</span><small>${esc(d.category)}</small></div>
      <h4>${esc(d.title)}</h4><p>${esc(d.content.slice(0, 130))}…</p><small>${d.content.split(/\s+/).length} words · ${esc(d.date)}</small>`;
    el.onclick = () => openDoc(d);
    box.appendChild(el);
  });
}

function openDoc(d) {
  $("dTitle").textContent = d.title;
  $("dMeta").innerHTML = `<span>${esc(FMT_LABEL[d.format] || d.format)}</span><span>${d.content.split(/\s+/).length} words</span><span>${esc(d.date)}</span>`;
  $("dBody").innerHTML = d.format === "JSON_DATA" ? `<pre style="white-space:pre-wrap">${esc(d.content)}</pre>` : `<div class="md">${md(d.content)}</div>`;
  $("dCopy").onclick = () => { navigator.clipboard.writeText(d.content); toast("Copied"); };
  $("dExport").onclick = () => {
    const ext = d.format === "JSON_DATA" ? "json" : "md";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([d.content], { type: "text/plain" }));
    a.download = d.title.replace(/[^\w-]+/g, "_") + "." + ext; a.click(); URL.revokeObjectURL(a.href);
  };
  $("dDelete").onclick = () => { if (!confirm("Delete this document?")) return; S.documents = S.documents.filter((x) => x.id !== d.id); save(); renderDocs(); $("mDoc").classList.add("hidden"); };
  $("mDoc").classList.remove("hidden");
}

/* ---------- UI helpers ---------- */
function switchView(id) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === id));
  document.querySelectorAll(".nav").forEach((n) => n.classList.toggle("active", n.dataset.v === id));
  if (id === "viewAgency") renderTasks();
  if (id === "viewDocs") renderDocs();
}
const closeSidebar = () => { if (innerWidth <= 768) document.body.classList.remove("sb-open"); };
const openModal = (id) => $(id).classList.remove("hidden");
function openSettings() {
  $("sKey").value = S.apiKey; $("sFree").value = S.modelFree; $("sPro").value = S.modelPro; openModal("mSettings");
}
function applyTier() { const b = $("btnTier"); b.textContent = S.pro ? "PRO" : "FREE"; b.classList.toggle("pro", S.pro); }

/* ---------- Init ---------- */
window.addEventListener("DOMContentLoaded", () => {
  load();
  if (innerWidth > 768) document.body.classList.add("sb-open");
  applyTier(); applyDots();

  document.querySelectorAll(".nav").forEach((n) => (n.onclick = () => switchView(n.dataset.v)));
  $("btnSidebar").onclick = () => document.body.classList.toggle("sb-open");
  $("scrim").onclick = closeSidebar;
  $("btnNewChat").onclick = () => newChat(); $("btnSideNew").onclick = () => newChat();
  $("btnSettings").onclick = openSettings;
  $("btnTier").onclick = () => { S.pro = !S.pro; save(); applyTier(); toast(S.pro ? "Pro model: " + S.modelPro : "Free model: " + S.modelFree); };
  $("dotsChip").onclick = () => { S.dotsOn = !S.dotsOn; save(); applyDots(); log(S.dotsOn ? "ONLINE" : "PAUSED", "Agency toggled"); };
  $("chkMaster").onchange = (e) => { S.dotsOn = e.target.checked; save(); applyDots(); log(S.dotsOn ? "ONLINE" : "PAUSED", "Agency toggled"); };

  // Chat
  $("btnSend").onclick = sendMessage;
  const ta = $("chatInput");
  ta.oninput = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 150) + "px"; };
  ta.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey && innerWidth > 768) { e.preventDefault(); sendMessage(); } };
  $("btnAttach").onclick = () => $("fileInput").click();
  $("fileInput").onchange = (e) => handleFile(e.target.files[0]);
  $("btnClearAttach").onclick = clearAttachment;

  // Modals
  document.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => b.closest(".modal").classList.add("hidden")));
  document.querySelectorAll(".modal").forEach((m) => (m.onclick = (e) => { if (e.target === m) m.classList.add("hidden"); }));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") document.querySelectorAll(".modal").forEach((m) => m.classList.add("hidden")); });

  // Agency
  $("btnAssign").onclick = () => openModal("mAssign");
  $("btnLogs").onclick = () => $("logsBox").classList.toggle("hidden");
  $("btnClearLogs").onclick = () => { S.logs = []; save(); renderLogs(); };
  document.querySelectorAll(".pill").forEach((p) => (p.onclick = () => { $("aTitle").value = p.dataset.t; $("aDesc").value = p.dataset.d; $("aFmt").value = p.dataset.f; }));
  $("btnAssignGo").onclick = () => {
    const title = $("aTitle").value.trim(), desc = $("aDesc").value.trim();
    if (!title || !desc) return toast("Add a title and instructions.");
    S.tasks.unshift({ id: uid("task"), title, description: desc, priority: $("aPri").value, format: $("aFmt").value, every: +$("aEvery").value, status: "ACTIVE", runs: 0, created: Date.now() });
    log("ASSIGNED", title); save(); renderTasks();
    $("aTitle").value = $("aDesc").value = ""; $("mAssign").classList.add("hidden");
  };
  $("taskFilters").onclick = (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    taskFilter = b.dataset.f;
    document.querySelectorAll("#taskFilters .chip").forEach((c) => c.classList.toggle("active", c === b));
    renderTasks();
  };

  // Docs
  $("btnConvert").onclick = () => openModal("mConvert");
  $("docSearch").oninput = renderDocs;
  $("docFilters").onclick = (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    docCat = b.dataset.c;
    document.querySelectorAll("#docFilters .chip").forEach((c) => c.classList.toggle("active", c === b));
    renderDocs();
  };
  $("btnConvertGo").onclick = async () => {
    const text = $("cText").value.trim(); if (!text) return toast("Paste some content first.");
    const fmt = $("cFmt").value, btn = $("btnConvertGo");
    btn.disabled = true; btn.textContent = "Converting…";
    try {
      const out = await ask(`Convert the following into: ${FMT_LABEL[fmt]}. ${$("cInst").value.trim()}\n\n${text}`, "You are a precise document conversion engine. Output only the converted document.");
      S.documents.unshift({ id: uid("doc"), title: $("cTitle").value.trim() || "Converted document", source: "MANUAL", format: fmt, category: FMT_CAT[fmt], date: new Date().toLocaleDateString(), content: out });
      save(); renderDocs(); $("mConvert").classList.add("hidden"); $("cText").value = ""; toast("Document created");
    } catch (err) { toast(err.message); }
    btn.disabled = false; btn.textContent = "Convert";
  };

  // Settings
  $("btnSaveSettings").onclick = () => {
    S.apiKey = $("sKey").value.trim();
    S.modelFree = $("sFree").value.trim() || "gemini-2.5-flash";
    S.modelPro = $("sPro").value.trim() || "gemini-2.5-pro";
    save(); $("mSettings").classList.add("hidden"); toast("Settings saved");
  };
  $("btnWipe").onclick = () => { if (confirm("Erase all chats, documents, tasks and your key?")) { localStorage.removeItem(KEY); location.reload(); } };

  renderConvs(); renderMessages(); renderTasks(); renderDocs(); renderLogs();
  if (!S.apiKey) setTimeout(() => toast("Add your Gemini API key in ⚙ Settings to start"), 800);
});
