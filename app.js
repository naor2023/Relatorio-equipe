const $ = (sel) => document.querySelector(sel);
const api = async (url, options = {}) => {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.error || "Erro na requisicao.");
  return data;
};

async function loadMe() {
  const { user } = await api("/api/me");
  const protectedPaths = new Set(["/central.html", "/historico.html", "/admin.html"]);
  if (!user && protectedPaths.has(location.pathname)) location.href = "/login.html";
  if (user && location.pathname === "/login.html") location.href = "/central.html";
  if (user && location.pathname === "/admin.html" && user.role !== "admin") location.href = "/central.html";
  if (user?.role !== "admin") document.querySelectorAll("[data-admin]").forEach((el) => el.remove());
  return user;
}

function toDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, dataUrl: reader.result });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function fillOptions() {
  const data = await api("/api/options");
  document.querySelectorAll("select[name=status]").forEach((select) => {
    select.innerHTML += data.statuses.map((x) => `<option>${x}</option>`).join("");
  });
}

function wireLogout() {
  $("#logoutBtn")?.addEventListener("click", async () => {
    await fetch("/api/logout", { method: "POST" });
    location.href = "/";
  });
}

function wireAttachmentLabels() {
  const attachmentInput = $("#attachmentInput");
  const attachmentName = $("#attachmentName");
  const cameraInput = $("#cameraInput");
  const cameraAttachmentName = $("#cameraAttachmentName");
  const attachmentButton = $("#attachmentButton");
  const cameraButton = $("#cameraButton");
  const cameraDialog = $("#cameraCaptureDialog");
  const cameraPreview = $("#cameraPreview");
  const cameraCanvas = $("#cameraCanvas");
  const capturePhotoBtn = $("#capturePhotoBtn");
  let webcamStream = null;
  let capturedCameraFile = null;

  const prefersDirectCameraInput = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.matchMedia("(pointer: coarse)").matches;

  const clearCapturedPhoto = () => {
    capturedCameraFile = null;
    if (cameraInput) cameraInput.value = "";
    if (cameraAttachmentName) cameraAttachmentName.textContent = "Nenhuma foto capturada.";
  };

  const stopWebcam = () => {
    if (!webcamStream) return;
    webcamStream.getTracks().forEach((track) => track.stop());
    webcamStream = null;
    if (cameraPreview) cameraPreview.srcObject = null;
  };

  attachmentButton?.addEventListener("click", () => attachmentInput?.click());
  cameraButton?.addEventListener("click", async () => {
    if (prefersDirectCameraInput()) {
      cameraInput?.click();
      return;
    }
    if (!cameraDialog || !cameraPreview || !navigator.mediaDevices?.getUserMedia) {
      cameraInput?.click();
      return;
    }
    try {
      webcamStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      cameraPreview.srcObject = webcamStream;
      cameraDialog.showModal();
    } catch {
      cameraInput?.click();
    }
  });

  attachmentInput?.addEventListener("change", () => {
    attachmentName.textContent = attachmentInput.files[0]?.name || "Nenhum arquivo selecionado.";
    if (attachmentInput.files[0] && cameraInput) {
      clearCapturedPhoto();
    }
  });

  cameraInput?.addEventListener("change", () => {
    capturedCameraFile = cameraInput.files[0] || null;
    cameraAttachmentName.textContent = cameraInput.files[0]?.name || "Nenhuma foto capturada.";
    if (cameraInput.files[0] && attachmentInput) {
      attachmentInput.value = "";
      if (attachmentName) attachmentName.textContent = "Nenhum arquivo selecionado.";
    }
  });

  capturePhotoBtn?.addEventListener("click", async () => {
    if (!cameraPreview || !cameraCanvas) return;
    const width = cameraPreview.videoWidth || 1280;
    const height = cameraPreview.videoHeight || 720;
    cameraCanvas.width = width;
    cameraCanvas.height = height;
    const ctx = cameraCanvas.getContext("2d");
    ctx.drawImage(cameraPreview, 0, 0, width, height);
    const blob = await new Promise((resolve) => cameraCanvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) return;
    capturedCameraFile = new File([blob], `captura-${Date.now()}.jpg`, { type: "image/jpeg" });
    if (cameraAttachmentName) cameraAttachmentName.textContent = capturedCameraFile.name;
    if (attachmentInput) {
      attachmentInput.value = "";
      if (attachmentName) attachmentName.textContent = "Nenhum arquivo selecionado.";
    }
    cameraDialog?.close();
    stopWebcam();
  });

  cameraDialog?.addEventListener("close", stopWebcam);
  window.addEventListener("beforeunload", stopWebcam);

  return {
    getSelectedFile() {
      return capturedCameraFile || cameraInput?.files[0] || attachmentInput?.files[0] || null;
    },
    reset() {
      if (attachmentInput) attachmentInput.value = "";
      if (attachmentName) attachmentName.textContent = "Nenhum arquivo selecionado.";
      clearCapturedPhoto();
      stopWebcam();
    }
  };
}

function qsFromForm(form) {
  const params = new URLSearchParams(new FormData(form));
  for (const [key, val] of [...params.entries()]) if (!val) params.delete(key);
  return params.toString();
}

function card(item) {
  return `<article class="occurrence-card ${item.status === "Nova" ? "nova" : ""}" data-id="${item.id}">
    <div class="card-head">
      <strong>#${item.id} - ${item.type}</strong>
      <span class="badge ${item.status.split(" ")[0]}">${item.status}</span>
    </div>
    <div class="meta">${item.created_at} | ${item.collaborator_name} | ${item.location}</div>
    <p>${escapeHtml(item.description)}</p>
    <button data-open="${item.id}">Abrir atendimento</button>
  </article>`;
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
}

function updateMetrics(items) {
  $("#countNova").textContent = items.filter((x) => x.status === "Nova").length;
  $("#countAtendimento").textContent = items.filter((x) => x.status === "Em atendimento").length;
  $("#countResolvida").textContent = items.filter((x) => x.status === "Resolvida").length;
}

let soundEnabled = false;
let pollingTimer = null;
let titleFlashTimer = null;
const defaultTitle = document.title;
let hasLoadedCentralOnce = false;
let lastSeenOccurrenceId = 0;
function beep() {
  if (!soundEnabled) return;
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 880;
  gain.gain.value = 0.08;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  setTimeout(() => { osc.stop(); ctx.close(); }, 220);
}

function showToast(message) {
  const stack = $("#toastStack");
  if (!stack) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  stack.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("toast-out");
    setTimeout(() => toast.remove(), 220);
  }, 4500);
}

function showInlineAlert(message) {
  const alert = $("#inlineAlert");
  if (!alert) return;
  alert.textContent = message;
  alert.hidden = false;
  alert.classList.remove("inline-alert-out");
  setTimeout(() => {
    alert.classList.add("inline-alert-out");
    setTimeout(() => {
      alert.hidden = true;
      alert.classList.remove("inline-alert-out");
    }, 220);
  }, 5000);
}

function flashTitle(message) {
  if (document.visibilityState === "visible") return;
  if (titleFlashTimer) clearInterval(titleFlashTimer);
  let showAlert = true;
  titleFlashTimer = setInterval(() => {
    document.title = showAlert ? message : defaultTitle;
    showAlert = !showAlert;
  }, 900);
}

function stopTitleFlash() {
  if (!titleFlashTimer) return;
  clearInterval(titleFlashTimer);
  titleFlashTimer = null;
  document.title = defaultTitle;
}

async function enableBrowserNotifications() {
  if (!("Notification" in window)) {
    showToast("Este navegador nao suporta notificacoes do sistema.");
    return "unsupported";
  }
  if (Notification.permission === "granted") return "granted";
  const permission = await Notification.requestPermission();
  return permission;
}

function notifyOccurrence(item) {
  const message = `Nova ocorrencia: ${item.type} em ${item.location}`;
  showInlineAlert(message);
  showToast(message);
  flashTitle("Nova ocorrencia recebida");
  if ("Notification" in window && Notification.permission === "granted") {
    const notification = new Notification("Nova ocorrencia recebida", {
      body: `${item.collaborator_name} registrou ${item.type} em ${item.location}.`,
      tag: `occurrence-${item.id}`
    });
    notification.onclick = () => {
      window.focus();
      stopTitleFlash();
    };
  }
}

async function openDetail(id) {
  const { occurrence } = await api(`/api/occurrences/${id}`);
  const attachments = occurrence.attachments.map((a) => {
    if (a.mime_type.startsWith("image/")) return `<div class="attachment-preview"><img src="${a.file_path}" alt="${a.original_name}"></div>`;
    if (a.mime_type.startsWith("video/")) return `<div class="attachment-preview"><video src="${a.file_path}" controls></video></div>`;
    return `<a href="${a.file_path}" target="_blank">${a.original_name}</a>`;
  }).join("");
  const notes = occurrence.notes.map((n) => `<p class="meta"><strong>${n.user_name}</strong> em ${n.created_at}: ${escapeHtml(n.note)}</p>`).join("");
  $("#detailContent").innerHTML = `
    <h2>Ocorrencia #${occurrence.id}</h2>
    <p><strong>${occurrence.type}</strong> em ${occurrence.location}</p>
    <p>${escapeHtml(occurrence.description)}</p>
    ${attachments}
    <label>Status
      <select id="detailStatus">${["Nova", "Em atendimento", "Resolvida", "Cancelada"].map((s) => `<option ${s === occurrence.status ? "selected" : ""}>${s}</option>`).join("")}</select>
    </label>
    <label>Observacoes da Central<textarea id="detailNote" rows="4"></textarea></label>
    <button type="button" class="primary" id="saveDetail">Salvar atualizacao</button>
    <h3>Observacoes</h3>${notes || "<p class='muted'>Nenhuma observacao.</p>"}
  `;
  $("#saveDetail").onclick = async () => {
    await api(`/api/occurrences/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: $("#detailStatus").value, note: $("#detailNote").value })
    });
    $("#detailDialog").close();
    await loadCentral();
  };
  $("#detailDialog").showModal();
}

async function loadCentral() {
  if (!$("#occurrenceList")) return;
  const { occurrences } = await api("/api/occurrences");
  $("#occurrenceList").innerHTML = occurrences.map(card).join("") || "<p class='muted'>Nenhuma ocorrencia registrada.</p>";
  updateMetrics(occurrences);
  const newestId = occurrences[0]?.id || 0;
  if (!hasLoadedCentralOnce) {
    hasLoadedCentralOnce = true;
    lastSeenOccurrenceId = newestId;
    return;
  }
  if (newestId > lastSeenOccurrenceId) {
    const newestItem = occurrences.find((item) => item.id === newestId);
    if (newestItem) {
      beep();
      notifyOccurrence(newestItem);
    }
    lastSeenOccurrenceId = newestId;
  }
}

async function initCentral() {
  await loadCentral();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") stopTitleFlash();
  });
  $("#notifyBtn")?.addEventListener("click", async () => {
    const permission = await enableBrowserNotifications();
    if (permission === "granted") {
      $("#notifyBtn").textContent = "Notificacoes ativas";
      showToast("Notificacoes do navegador ativadas.");
      return;
    }
    if (permission === "denied") {
      showToast("As notificacoes foram bloqueadas no navegador.");
      return;
    }
    if (permission === "unsupported") return;
  });
  $("#soundBtn")?.addEventListener("click", () => {
    soundEnabled = true;
    $("#soundBtn").textContent = "Alerta sonoro ativo";
    beep();
  });
  $("#occurrenceList").addEventListener("click", (ev) => {
    const id = ev.target.dataset.open;
    if (id) openDetail(id);
  });
  const events = new EventSource("/events");
  events.addEventListener("occurrence-created", async (event) => {
    const item = JSON.parse(event.data);
    lastSeenOccurrenceId = Math.max(lastSeenOccurrenceId, item.id || 0);
    notifyOccurrence(item);
    await loadCentral();
  });
  events.addEventListener("occurrence-updated", loadCentral);
  events.onerror = () => {
    if ($("#liveState")) $("#liveState").textContent = "Reconectando";
    if (!pollingTimer) pollingTimer = setInterval(loadCentral, 3000);
  };
  events.onopen = () => {
    if ($("#liveState")) $("#liveState").textContent = "Online";
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
  };
}

async function initHistory() {
  const form = $("#filters");
  const render = async () => {
    const { occurrences } = await api(`/api/occurrences?${qsFromForm(form)}`);
    $("#historyRows").innerHTML = occurrences.map((r) => `<tr><td>${r.id}</td><td>${r.created_at}</td><td>${r.collaborator_name}</td><td>${r.location}</td><td>${r.type}</td><td>${r.status}</td><td>${escapeHtml(r.description)}</td></tr>`).join("");
  };
  form.addEventListener("submit", (ev) => { ev.preventDefault(); render(); });
  $("#csvBtn").onclick = () => { location.href = `/api/export.csv?${qsFromForm(form)}`; };
  $("#pdfBtn").onclick = () => { window.open(`/api/relatorio?${qsFromForm(form)}`, "_blank"); };
  await render();
}

async function initAdmin() {
  const render = async () => {
    const data = await api("/api/admin");
    $("#userRows").innerHTML = data.users.map((u) => `<tr><td>${u.name}</td><td>${u.username}</td><td>${u.role}</td><td>${u.active ? "Sim" : "Nao"}</td></tr>`).join("");
    $("#locationList").innerHTML = data.locations.map((x) => `<span>${x.name}</span>`).join("");
    $("#typeList").innerHTML = data.types.map((x) => `<span>${x.name}</span>`).join("");
  };
  const submit = (form, url) => {
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        await api(url, { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
        form.reset();
        $("#adminMessage").textContent = "Cadastro realizado com sucesso.";
        await render();
      } catch (error) {
        $("#adminMessage").textContent = error.message;
      }
    });
  };
  submit($("#userForm"), "/api/admin/users");
  submit($("#locationForm"), "/api/admin/locations");
  submit($("#typeForm"), "/api/admin/types");
  await render();
}

document.addEventListener("DOMContentLoaded", async () => {
  if ($("#loginForm")) {
    $("#loginForm").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        const data = await api("/api/login", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(ev.target))) });
        location.href = "/central.html";
      } catch (error) {
        $("#loginMessage").textContent = error.message;
      }
    });
    await loadMe();
    return;
  }
  await loadMe();
  wireLogout();
  const attachmentController = wireAttachmentLabels();
  await fillOptions().catch(() => {});
  if ($("#occurrenceForm")) {
    $("#occurrenceForm").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const form = ev.target;
      const file = attachmentController?.getSelectedFile?.() || form.camera_attachment.files[0] || form.attachment.files[0];
      const payload = Object.fromEntries(new FormData(form));
      delete payload.camera_attachment;
      payload.attachment = await toDataUrl(file);
      try {
        await api("/api/occurrences", { method: "POST", body: JSON.stringify(payload) });
        form.reset();
        attachmentController?.reset?.();
        $("#formMessage").textContent = "Ocorrencia enviada.";
      } catch (error) {
        $("#formMessage").textContent = error.message;
      }
    });
  }
  if ($("#occurrenceList")) await initCentral();
  if ($("#historyRows")) await initHistory();
  if ($("#userRows")) await initAdmin();
});
