/**
 * Dots AI Studio - ChatGPT & 24/7 Autonomous Agency
 * Client Engine with Local Storage Persistence & Real Gemini Integration
 */

// Default configuration with pre-configured API key
const DEFAULT_API_KEY 
const MODEL_FREE = "gemini-3.5-flash";
const MODEL_PREMIUM = "gemini-3.1-pro-preview";

// State
let appState = {
  isPremium: false,
  apiKey: DEFAULT_API_KEY,
  isDotsActive: true,
  activeView: "viewChat",
  currentConvId: null,
  attachedImageBase64: null,
  attachedFileName: null,
  attachedFileContent: null,
  conversations: [],
  documents: [],
  tasks: [],
  logs: []
};

// Storage Keys
const STORAGE_KEY = "dots_ai_studio_state_v1";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      appState = { ...appState, ...parsed };
    }
  } catch (e) {
    console.warn("Could not load localStorage state:", e);
  }

  // Seed defaults if empty
  if (!appState.conversations || appState.conversations.length === 0) {
    const initConv = {
      id: "conv_" + Date.now(),
      title: "Welcome to Dots AI",
      messages: [
        {
          id: "m_1",
          sender: "ASSISTANT",
          text: "👋 Welcome to **Dots AI Studio**! You can chat freely, upload photos for visual analysis, attach documents to summarize or convert, and toggle between Free and Premium tiers.\n\n✨ Check out the **Dots 24/7** tab for an autonomous agency companion that works around the clock without restrictions!",
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]
    };
    appState.conversations = [initConv];
    appState.currentConvId = initConv.id;
  }

  if (!appState.tasks || appState.tasks.length === 0) {
    appState.tasks = [
      {
        id: "task_1",
        title: "Autonomous Document Auto-Summarizer",
        description: "Monitors uploaded files, academic texts, and converts them into executive summaries with key bullet points.",
        priority: "HIGH",
        status: "ACTIVE",
        outputFormat: "EXECUTIVE_SUMMARY",
        resultSummary: "24/7 listener online. Ready to summarize documents.",
        lastRun: Date.now() - 600000
      },
      {
        id: "task_2",
        title: "Universal Format Converter",
        description: "Converts raw drafts and notes into Study Guides, Markdown, and JSON with zero length restrictions.",
        priority: "HIGH",
        status: "ACTIVE",
        outputFormat: "STUDY_GUIDE",
        resultSummary: "Universal conversion pipeline ready.",
        lastRun: Date.now() - 1200000
      }
    ];
  }

  if (!appState.documents || appState.documents.length === 0) {
    appState.documents = [
      {
        id: "doc_1",
        title: "AI Agency System Architecture",
        sourceFormat: "RAW_NOTES",
        targetFormat: "EXECUTIVE_SUMMARY",
        category: "Summary",
        wordCount: 75,
        date: new Date().toLocaleDateString(),
        content: "# Executive Summary: Dots 24/7 Agency\n\n- **Autonomous Architecture**: Dots operates 24/7 with zero downtime.\n- **Data Privacy**: All conversation logs and files persist locally.\n- **Zero Restrictions**: Universal document conversion across formats."
      }
    ];
  }

  if (!appState.logs) {
    appState.logs = [];
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      isPremium: appState.isPremium,
      apiKey: appState.apiKey,
      isDotsActive: appState.isDotsActive,
      conversations: appState.conversations,
      documents: appState.documents,
      tasks: appState.tasks,
      logs: appState.logs
    }));
  } catch (e) {
    console.error("Save error:", e);
  }
}

function addLog(action, details) {
  const logItem = {
    time: new Date().toLocaleTimeString(),
    action,
    details
  };
  appState.logs.unshift(logItem);
  if (appState.logs.length > 50) appState.logs.pop();
  saveState();
  renderLogs();
}

// Gemini API Direct REST Caller
async function callGeminiApi({ prompt, imageBase64, fileContent, systemInstruction }) {
  const model = appState.isPremium ? MODEL_PREMIUM : MODEL_FREE;
  const apiKey = appState.apiKey || DEFAULT_API_KEY;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const parts = [];

  if (fileContent) {
    parts.push({
      text: `--- ATTACHED DOCUMENT ---\n${fileContent}\n--- END OF ATTACHED DOCUMENT ---\n\n`
    });
  }

  if (prompt) {
    parts.push({ text: prompt });
  } else if (!fileContent && !imageBase64) {
    parts.push({ text: "Please assist me." });
  }

  if (imageBase64) {
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: cleanBase64
      }
    });
  }

  const payload = {
    contents: [{ parts }]
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    let msg = `HTTP ${response.status}`;
    try {
      const errObj = JSON.parse(errText);
      if (errObj.error && errObj.error.message) msg = errObj.error.message;
    } catch (_) {}
    throw new Error(msg);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return text || "No response generated.";
}

// UI Rendering Functions
function renderConversations() {
  const container = document.getElementById("conversationsList");
  if (!container) return;
  container.innerHTML = "";

  appState.conversations.forEach(conv => {
    const item = document.createElement("div");
    item.className = `conversation-item ${conv.id === appState.currentConvId ? "active" : ""}`;
    item.textContent = conv.title;
    item.onclick = () => {
      appState.currentConvId = conv.id;
      renderConversations();
      renderMessages();
      closeSidebar();
    };
    container.appendChild(item);
  });
}

function renderMessages() {
  const container = document.getElementById("chatMessages");
  if (!container) return;
  container.innerHTML = "";

  const conv = appState.conversations.find(c => c.id === appState.currentConvId);
  if (!conv || !conv.messages || conv.messages.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 40px 20px; color: var(--text-secondary);">
        <h3 style="margin-bottom:8px; color:var(--text-primary)">What can I help with today?</h3>
        <p>Attach documents to summarize, upload photos for visual analysis, or assign responsibilities to Dots 24/7 Agency.</p>
      </div>
    `;
    return;
  }

  conv.messages.forEach(msg => {
    const isUser = msg.sender === "USER";
    const isDots = msg.sender === "DOTS";

    const msgEl = document.createElement("div");
    msgEl.className = `chat-message ${isUser ? "user" : (isDots ? "dots" : "assistant")}`;

    let avatarHtml = "";
    if (!isUser) {
      avatarHtml = `<div class="message-avatar">${isDots ? '🤖' : '✨'}</div>`;
    }

    let imageHtml = "";
    if (msg.image) {
      imageHtml = `<img src="${msg.image}" alt="Attached photo">`;
    }

    let tagHtml = "";
    if (isDots) tagHtml = `<div class="message-tag">DOTS 24/7 AGENCY</div>`;
    else if (msg.isSummary) tagHtml = `<div class="message-tag" style="color:var(--free-primary);">EXECUTIVE SUMMARY</div>`;

    msgEl.innerHTML = `
      ${avatarHtml}
      <div class="message-bubble">
        ${tagHtml}
        ${imageHtml}
        <div class="message-text">${formatMarkdownText(msg.text)}</div>
        <div style="font-size:0.7rem; color:var(--text-muted); margin-top:4px; text-align:${isUser ? 'right' : 'left'}">${msg.time}</div>
      </div>
    `;

    container.appendChild(msgEl);
  });

  container.scrollTop = container.scrollHeight;
}

function formatMarkdownText(text) {
  if (!text) return "";
  let esc = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Bold
  esc = esc.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Newlines
  esc = esc.replace(/\n/g, '<br>');
  return esc;
}

function renderTasks() {
  const container = document.getElementById("tasksList");
  if (!container) return;
  container.innerHTML = "";

  const activeTasks = appState.tasks.filter(t => t.status === "ACTIVE").length;
  const completedTasks = appState.tasks.filter(t => t.status === "COMPLETED").length;

  document.getElementById("statActiveTasks").textContent = activeTasks;
  document.getElementById("statDeliverables").textContent = completedTasks;

  appState.tasks.forEach(task => {
    const card = document.createElement("div");
    card.className = "task-card";
    card.innerHTML = `
      <div class="card-top">
        <span class="priority-tag ${task.priority.toLowerCase()}">${task.priority} PRIORITY</span>
        <span class="status-badge">${task.status}</span>
      </div>
      <div class="task-title">${task.title}</div>
      <div class="task-desc">${task.description}</div>
      ${task.resultSummary ? `<div style="font-size:0.8rem; background:rgba(0,0,0,0.3); padding:8px; border-radius:6px; color:#e2e8f0;"><strong>Latest Deliverable:</strong> ${task.resultSummary}</div>` : ''}
      <div class="task-actions">
        <span style="font-size:0.75rem; color:var(--text-muted);">${task.outputFormat}</span>
        <button class="btn-run-deliverable" data-task-id="${task.id}">Run Deliverable</button>
      </div>
    `;

    card.querySelector(".btn-run-deliverable").onclick = (e) => {
      e.stopPropagation();
      executeTaskDeliverable(task);
    };

    container.appendChild(card);
  });
}

function renderDocuments() {
  const container = document.getElementById("documentsGrid");
  if (!container) return;
  container.innerHTML = "";

  const query = (document.getElementById("docSearchInput")?.value || "").toLowerCase();

  const filtered = appState.documents.filter(doc => {
    return !query || doc.title.toLowerCase().includes(query) || doc.content.toLowerCase().includes(query);
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:30px; color:var(--text-secondary);">No converted documents found.</div>`;
    return;
  }

  filtered.forEach(doc => {
    const card = document.createElement("div");
    card.className = "doc-card";
    card.innerHTML = `
      <div class="card-top">
        <span class="format-badge">${doc.sourceFormat} → ${doc.targetFormat}</span>
        <span style="font-size:0.75rem; color:var(--text-secondary);">${doc.category || 'Document'}</span>
      </div>
      <div class="doc-title">${doc.title}</div>
      <div class="doc-snippet">${doc.content.substring(0, 140)}...</div>
      <div class="task-actions">
        <span style="font-size:0.75rem; color:var(--text-muted);">${doc.wordCount || 0} words • ${doc.date}</span>
        <button class="btn-action-sm">View Document</button>
      </div>
    `;

    card.onclick = () => openDocViewer(doc);
    container.appendChild(card);
  });
}

function renderLogs() {
  const container = document.getElementById("logsFeed");
  if (!container) return;
  container.innerHTML = "";

  if (appState.logs.length === 0) {
    container.innerHTML = `<div style="color:var(--text-muted);">No 24/7 audit logs yet.</div>`;
    return;
  }

  appState.logs.forEach(log => {
    const entry = document.createElement("div");
    entry.className = "log-entry";
    entry.innerHTML = `
      <span class="log-time">${log.time}</span>
      <span class="log-action">[${log.action}]</span>
      <span class="log-text">${log.details}</span>
    `;
    container.appendChild(entry);
  });
}

// User Actions
async function sendMessage() {
  const inputEl = document.getElementById("chatInput");
  const text = inputEl.value.trim();
  const image = appState.attachedImageBase64;
  const fileName = appState.attachedFileName;
  const fileContent = appState.attachedFileContent;

  if (!text && !image && !fileContent) return;

  const conv = appState.conversations.find(c => c.id === appState.currentConvId);
  if (!conv) return;

  // Add User Message
  conv.messages.push({
    id: "msg_" + Date.now(),
    sender: "USER",
    text: text || `[Attached: ${fileName || "Photo"}]`,
    image: image,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  });

  inputEl.value = "";
  clearAttachment();
  renderMessages();

  try {
    const aiText = await callGeminiApi({
      prompt: text,
      imageBase64: image,
      fileContent: fileContent,
      systemInstruction: "You are a versatile, polite AI assistant. Answer accurately with high clarity."
    });

    conv.messages.push({
      id: "msg_" + Date.now(),
      sender: "ASSISTANT",
      text: aiText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  } catch (err) {
    conv.messages.push({
      id: "msg_" + Date.now(),
      sender: "ASSISTANT",
      text: `⚠️ Generation error: ${err.message}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  }

  saveState();
  renderMessages();
}

async function executeTaskDeliverable(task) {
  addLog("TASK_START", `Executing responsibility: ${task.title}`);

  try {
    const deliverable = await callGeminiApi({
      prompt: `Execute duty '${task.title}': ${task.description}. Produce a complete deliverable in format ${task.outputFormat}.`,
      systemInstruction: "You are Dots, a 24/7 autonomous AI agency. Produce high-level professional deliverables without restrictions."
    });

    task.status = "COMPLETED";
    task.resultSummary = deliverable.substring(0, 200) + "...";
    task.lastRun = Date.now();

    // Auto-save to documents studio
    appState.documents.unshift({
      id: "doc_" + Date.now(),
      title: `Dots Deliverable: ${task.title}`,
      sourceFormat: "AGENCY_TASK",
      targetFormat: task.outputFormat,
      category: "Report",
      wordCount: deliverable.split(/\s+/).length,
      date: new Date().toLocaleDateString(),
      content: deliverable
    });

    addLog("TASK_COMPLETE", `Deliverable generated for '${task.title}' and saved to Converted Documents Studio.`);
    saveState();
    renderTasks();
    renderDocuments();
    alert(`Dots Agency successfully generated deliverable for '${task.title}'!`);
  } catch (err) {
    addLog("TASK_ERROR", `Failed: ${err.message}`);
    alert(`Agency error: ${err.message}`);
  }
}

function clearAttachment() {
  appState.attachedImageBase64 = null;
  appState.attachedFileName = null;
  appState.attachedFileContent = null;
  document.getElementById("attachmentPreviewStrip").classList.add("hidden");
}

function openDocViewer(doc) {
  document.getElementById("viewDocTitle").textContent = doc.title;
  document.getElementById("viewDocFormatBadge").textContent = `${doc.sourceFormat} → ${doc.targetFormat}`;
  document.getElementById("viewDocWordCount").textContent = `${doc.wordCount || 0} words`;
  document.getElementById("viewDocDate").textContent = doc.date;
  document.getElementById("viewDocBody").textContent = doc.content;

  document.getElementById("btnCopyViewDoc").onclick = () => {
    navigator.clipboard.writeText(doc.content);
    alert("Copied to clipboard!");
  };

  document.getElementById("btnDeleteViewDoc").onclick = () => {
    appState.documents = appState.documents.filter(d => d.id !== doc.id);
    saveState();
    renderDocuments();
    document.getElementById("modalViewDoc").classList.add("hidden");
  };

  document.getElementById("modalViewDoc").classList.remove("hidden");
}

function switchView(viewId) {
  document.querySelectorAll(".view-panel").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));

  document.getElementById(viewId).classList.add("active");
  document.querySelector(`.nav-item[data-view="${viewId}"]`).classList.add("active");
  appState.activeView = viewId;

  if (viewId === "viewDotsAgency") renderTasks();
  if (viewId === "viewDocsStudio") renderDocuments();
}

function toggleSidebar() {
  document.getElementById("appSidebar").classList.toggle("open");
}

function closeSidebar() {
  document.getElementById("appSidebar").classList.remove("open");
}

// Background Autonomous Simulation Cycle for Dots 24/7 Agency
setInterval(() => {
  if (appState.isDotsActive) {
    const activeTasks = appState.tasks.filter(t => t.status === "ACTIVE");
    if (activeTasks.length > 0) {
      const randomTask = activeTasks[Math.floor(Math.random() * activeTasks.length)];
      addLog("24/7_SCAN", `Dots 24/7 Agency autonomous health check on '${randomTask.title}'.`);
    }
  }
}, 45000);

// Event Listeners Initialization
window.addEventListener("DOMContentLoaded", () => {
  loadState();

  // Tier setup
  if (appState.isPremium) {
    document.body.classList.remove("free-tier");
    document.body.classList.add("premium-tier");
    document.getElementById("tierLabel").textContent = "PRO TIER";
  }

  // Dots 24/7 Master switch setup
  const masterSwitch = document.getElementById("chkDots247Master");
  const masterChip = document.getElementById("btnToggleDotsMaster");
  masterSwitch.checked = appState.isDotsActive;

  function updateDotsUi(active) {
    appState.isDotsActive = active;
    masterSwitch.checked = active;
    if (active) {
      masterChip.classList.remove("paused");
      masterChip.classList.add("active");
      masterChip.querySelector(".dots-status-label").textContent = "Dots 24/7: ACTIVE";
      document.getElementById("agencySwitchText").textContent = "ACTIVE 24/7";
      document.getElementById("agencyStatusSubtext").textContent = "Autonomous agency running 24/7. Monitoring assigned responsibilities.";
      addLog("AGENCY_ONLINE", "Dots 24/7 Agency autonomous monitoring activated.");
    } else {
      masterChip.classList.add("paused");
      masterChip.classList.remove("active");
      masterChip.querySelector(".dots-status-label").textContent = "Dots: PAUSED";
      document.getElementById("agencySwitchText").textContent = "PAUSED";
      document.getElementById("agencyStatusSubtext").textContent = "Dots agency is in standby mode. Toggle to resume 24/7 operations.";
      addLog("AGENCY_PAUSED", "Dots agency suspended by user.");
    }
    saveState();
  }

  masterSwitch.onchange = (e) => updateDotsUi(e.target.checked);
  masterChip.onclick = () => updateDotsUi(!appState.isDotsActive);

  // Tier Switcher Click
  document.getElementById("btnTierSwitcher").onclick = () => {
    appState.isPremium = !appState.isPremium;
    if (appState.isPremium) {
      document.body.classList.remove("free-tier");
      document.body.classList.add("premium-tier");
      document.getElementById("tierLabel").textContent = "PRO TIER";
      alert("Unlocked Premium Pro Tier (Gemini 3.1 Pro + Priority Agency Speed)!");
    } else {
      document.body.classList.add("free-tier");
      document.body.classList.remove("premium-tier");
      document.getElementById("tierLabel").textContent = "FREE TIER";
      alert("Switched to Free Tier (Gemini 3.5 Flash).");
    }
    saveState();
  };

  // Nav Items
  document.querySelectorAll(".nav-item").forEach(item => {
    item.onclick = () => switchView(item.getAttribute("data-view"));
  });

  // Sidebar controls
  document.getElementById("btnToggleSidebar").onclick = toggleSidebar;
  document.getElementById("btnNewChat").onclick = startNewChat;
  document.getElementById("btnSidebarNewChat").onclick = startNewChat;

  function startNewChat() {
    const newConv = {
      id: "conv_" + Date.now(),
      title: "Chat #" + (appState.conversations.length + 1),
      messages: []
    };
    appState.conversations.unshift(newConv);
    appState.currentConvId = newConv.id;
    saveState();
    renderConversations();
    renderMessages();
    switchView("viewChat");
    closeSidebar();
  }

  // Send Message
  document.getElementById("btnSendMessage").onclick = sendMessage;
  document.getElementById("chatInput").onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Photo Attachment (Vision)
  document.getElementById("btnAttachPhoto").onclick = () => {
    document.getElementById("filePhotoInput").click();
  };

  document.getElementById("filePhotoInput").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      appState.attachedImageBase64 = event.target.result;
      document.getElementById("previewContent").innerHTML = `
        <img src="${event.target.result}" style="width:36px; height:36px; object-fit:cover; border-radius:6px;">
        <span>Photo attached (${file.name})</span>
      `;
      document.getElementById("attachmentPreviewStrip").classList.remove("hidden");
    };
    reader.readAsDataURL(file);
  };

  // Document Attachment
  document.getElementById("btnAttachDoc").onclick = () => {
    document.getElementById("fileDocInput").click();
  };

  document.getElementById("fileDocInput").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      appState.attachedFileName = file.name;
      appState.attachedFileContent = event.target.result;
      document.getElementById("previewContent").innerHTML = `
        <span>📄 Document attached: <strong>${file.name}</strong></span>
        <button id="btnQuickSummarizeDoc" class="btn-action-sm" style="margin-left:8px;">Summarize Now</button>
      `;
      document.getElementById("attachmentPreviewStrip").classList.remove("hidden");

      document.getElementById("btnQuickSummarizeDoc").onclick = () => {
        document.getElementById("chatInput").value = "Please summarize this document.";
        sendMessage();
      };
    };
    reader.readAsText(file);
  };

  document.getElementById("btnClearAttachment").onclick = clearAttachment;

  // Modals Open/Close
  document.querySelectorAll("[data-close]").forEach(el => {
    el.onclick = () => {
      document.getElementById(el.getAttribute("data-close")).classList.add("hidden");
    };
  });

  document.getElementById("btnAssignNewResponsibility").onclick = () => {
    document.getElementById("modalAssignDots").classList.remove("hidden");
  };

  document.getElementById("btnNewDocConversion").onclick = () => {
    document.getElementById("modalDocConvert").classList.remove("hidden");
  };

  document.getElementById("btnOpenSettings").onclick = () => {
    document.getElementById("inputApiKeyOverride").value = appState.apiKey;
    document.getElementById("modalSettings").classList.remove("hidden");
  };

  document.getElementById("btnSaveSettings").onclick = () => {
    const key = document.getElementById("inputApiKeyOverride").value.trim();
    appState.apiKey = key || DEFAULT_API_KEY;
    saveState();
    document.getElementById("modalSettings").classList.add("hidden");
    alert("Settings saved!");
  };

  document.getElementById("btnToggleAgencyLogs").onclick = () => {
    document.getElementById("agencyAuditLogsBox").classList.toggle("hidden");
  };

  document.getElementById("btnClearLogs").onclick = () => {
    appState.logs = [];
    saveState();
    renderLogs();
  };

  // Preset pills
  document.querySelectorAll(".preset-pill").forEach(pill => {
    pill.onclick = () => {
      document.getElementById("dotsTaskTitle").value = pill.getAttribute("data-title");
      document.getElementById("dotsTaskDesc").value = pill.getAttribute("data-desc");
      document.getElementById("dotsOutputFormat").value = pill.getAttribute("data-fmt");
    };
  });

  // Submit Assign Dots
  document.getElementById("btnSubmitAssignDots").onclick = () => {
    const title = document.getElementById("dotsTaskTitle").value.trim();
    const desc = document.getElementById("dotsTaskDesc").value.trim();
    const pri = document.getElementById("dotsPriority").value;
    const fmt = document.getElementById("dotsOutputFormat").value;

    if (!title || !desc) {
      alert("Please provide both title and instructions.");
      return;
    }

    appState.tasks.unshift({
      id: "task_" + Date.now(),
      title,
      description: desc,
      priority: pri,
      status: "ACTIVE",
      outputFormat: fmt,
      lastRun: null
    });

    addLog("TASK_ASSIGNED", `Assigned responsibility '${title}' to Dots 24/7 Agency.`);
    saveState();
    renderTasks();
    document.getElementById("modalAssignDots").classList.add("hidden");
  };

  // Submit Convert Document
  document.getElementById("btnSubmitConvert").onclick = async () => {
    const title = document.getElementById("convertTitle").value.trim() || "Converted Document";
    const sourceFmt = document.getElementById("convertSourceFormat").value;
    const targetFmt = document.getElementById("convertTargetFormat").value;
    const content = document.getElementById("convertContent").value.trim();
    const instructions = document.getElementById("convertInstructions").value.trim();

    if (!content) {
      alert("Please paste content to convert.");
      return;
    }

    const btn = document.getElementById("btnSubmitConvert");
    btn.disabled = true;
    btn.textContent = "Converting...";

    try {
      const convertedText = await callGeminiApi({
        prompt: `Convert from ${sourceFmt} into ${targetFmt}. User instructions: ${instructions || "None"}.\n\nOriginal Text:\n${content}`,
        systemInstruction: "You are a universal document conversion engine that flawlessly converts content without length restrictions."
      });

      appState.documents.unshift({
        id: "doc_" + Date.now(),
        title,
        sourceFormat: sourceFmt,
        targetFormat: targetFmt,
        category: "Report",
        wordCount: convertedText.split(/\s+/).length,
        date: new Date().toLocaleDateString(),
        content: convertedText
      });

      saveState();
      renderDocuments();
      document.getElementById("modalDocConvert").classList.add("hidden");
      switchView("viewDocsStudio");
    } catch (err) {
      alert("Conversion error: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Convert with AI";
    }
  };

  // Search input
  document.getElementById("docSearchInput").oninput = renderDocuments;

  // Filter chips
  document.querySelectorAll(".docs-category-chips .chip").forEach(chip => {
    chip.onclick = () => {
      document.querySelectorAll(".docs-category-chips .chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      const cat = chip.getAttribute("data-category");
      if (cat === "All") {
        document.getElementById("docSearchInput").value = "";
      } else {
        document.getElementById("docSearchInput").value = cat;
      }
      renderDocuments();
    };
  });

  // Initial render
  renderConversations();
  renderMessages();
  renderTasks();
  renderDocuments();
  renderLogs();
});
