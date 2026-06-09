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
  window.currentUser = user;
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

function formatDateForDisplay(iso) {
  if (!iso) return "";
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

function parseDisplayDate(text) {
  const match = String(text || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return "";
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day)
  ) return "";
  return `${year}-${month}-${day}`;
}

function maskDisplayDate(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
  const parts = [];
  if (digits.slice(0, 2)) parts.push(digits.slice(0, 2));
  if (digits.slice(2, 4)) parts.push(digits.slice(2, 4));
  if (digits.slice(4, 8)) parts.push(digits.slice(4, 8));
  return parts.join("/");
}

function isoFromDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromIso(iso) {
  const [year, month, day] = String(iso).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function initHistoryDatePickers(form) {
  const picker = $("#historyDatePicker");
  const monthNames = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const weekDays = ["D", "S", "T", "Q", "Q", "S", "S"];
  if (!picker) return;

  const fields = [
    {
      wrapper: $("#fromDisplay")?.closest(".date-field"),
      display: $("#fromDisplay"),
      hidden: $("#fromValue")
    },
    {
      wrapper: $("#toDisplay")?.closest(".date-field"),
      display: $("#toDisplay"),
      hidden: $("#toValue")
    }
  ].filter((field) => field.wrapper && field.display && field.hidden);

  const state = {
    activeField: null,
    viewDate: new Date()
  };

  const setFieldValue = (field, iso) => {
    field.hidden.value = iso || "";
    field.display.value = formatDateForDisplay(iso);
  };

  const closePicker = () => {
    picker.hidden = true;
    fields.forEach((field) => field.wrapper.classList.remove("date-field-open"));
    state.activeField = null;
  };

  const openPicker = (field) => {
    state.activeField = field;
    fields.forEach((item) => item.wrapper.classList.toggle("date-field-open", item === field));
    state.viewDate = field.hidden.value ? dateFromIso(field.hidden.value) : new Date();
    const rect = field.wrapper.getBoundingClientRect();
    picker.style.top = `${rect.bottom + 8}px`;
    picker.style.left = `${rect.left}px`;
    picker.hidden = false;
    renderPicker();
  };

  const renderPicker = () => {
    if (!state.activeField) return;
    const year = state.viewDate.getFullYear();
    const month = state.viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const offset = firstDay.getDay();
    const start = new Date(year, month, 1 - offset);
    const activeIso = state.activeField.hidden.value;
    const todayIso = isoFromDate(new Date());
    const dayButtons = Array.from({ length: 42 }, (_, index) => {
      const current = new Date(start);
      current.setDate(start.getDate() + index);
      const iso = isoFromDate(current);
      const classes = [
        "calendar-day",
        current.getMonth() !== month ? "calendar-day-muted" : "",
        iso === activeIso ? "calendar-day-selected" : "",
        iso === todayIso ? "calendar-day-today" : ""
      ].filter(Boolean).join(" ");
      return `<button type="button" class="${classes}" data-calendar-day="${iso}">${current.getDate()}</button>`;
    }).join("");

    picker.innerHTML = `
      <div class="calendar-shell">
        <div class="calendar-head">
          <button type="button" class="calendar-nav" data-calendar-nav="-1" aria-label="Mes anterior">‹</button>
          <strong>${monthNames[month]} de ${year}</strong>
          <button type="button" class="calendar-nav" data-calendar-nav="1" aria-label="Proximo mes">›</button>
        </div>
        <div class="calendar-weekdays">${weekDays.map((day) => `<span>${day}</span>`).join("")}</div>
        <div class="calendar-grid">${dayButtons}</div>
        <div class="calendar-foot">
          <button type="button" class="calendar-foot-btn" data-calendar-action="clear">Limpar</button>
          <button type="button" class="calendar-foot-btn" data-calendar-action="today">Hoje</button>
        </div>
      </div>
    `;
  };

  fields.forEach((field) => {
    setFieldValue(field, field.hidden.value);

    field.display.addEventListener("focus", () => openPicker(field));
    field.display.addEventListener("input", () => {
      field.display.value = maskDisplayDate(field.display.value);
    });
    field.display.addEventListener("blur", () => {
      const iso = parseDisplayDate(field.display.value);
      setFieldValue(field, iso);
    });
    field.display.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        openPicker(field);
      }
    });
  });

  form.addEventListener("click", (event) => {
    const button = event.target.closest("[data-date-button]");
    if (!button) return;
    const hidden = form.querySelector(`#${button.dataset.dateButton}`);
    const field = fields.find((item) => item.hidden === hidden);
    if (field) openPicker(field);
  });

  picker.addEventListener("click", (event) => {
    const nav = event.target.closest("[data-calendar-nav]");
    if (nav) {
      state.viewDate.setMonth(state.viewDate.getMonth() + Number(nav.dataset.calendarNav));
      renderPicker();
      return;
    }
    const day = event.target.closest("[data-calendar-day]");
    if (day && state.activeField) {
      setFieldValue(state.activeField, day.dataset.calendarDay);
      closePicker();
      return;
    }
    const action = event.target.closest("[data-calendar-action]");
    if (!action || !state.activeField) return;
    if (action.dataset.calendarAction === "clear") {
      setFieldValue(state.activeField, "");
      closePicker();
      return;
    }
    if (action.dataset.calendarAction === "today") {
      setFieldValue(state.activeField, isoFromDate(new Date()));
      closePicker();
    }
  });

  document.addEventListener("click", (event) => {
    if (picker.hidden) return;
    if (event.target.closest(".date-field") || event.target.closest(".history-date-picker")) return;
    closePicker();
  });

  window.addEventListener("resize", closePicker);
  window.addEventListener("scroll", closePicker, true);
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
  events.addEventListener("occurrence-deleted", loadCentral);
  events.addEventListener("occurrences-deleted", loadCentral);
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
  const isAdmin = window.currentUser?.role === "admin";
  const historyMessage = $("#historyMessage");
  initHistoryDatePickers(form);
  const render = async () => {
    const { occurrences } = await api(`/api/occurrences?${qsFromForm(form)}`);
    $("#historyRows").innerHTML = occurrences.map((r) => `<tr><td data-label="N.">${r.id}</td><td data-label="Data">${r.created_at}</td><td data-label="Colaborador">${r.collaborator_name}</td><td data-label="Local">${r.location}</td><td data-label="Tipo">${r.type}</td><td data-label="Status">${r.status}</td><td data-label="Descricao">${escapeHtml(r.description)}</td>${isAdmin ? `<td data-label="Acoes"><button type="button" class="danger small-action" data-delete-occurrence="${r.id}">Apagar</button></td>` : ""}</tr>`).join("");
  };
  form.addEventListener("submit", (ev) => { ev.preventDefault(); render(); });
  $("#csvBtn").onclick = () => { location.href = `/api/export.csv?${qsFromForm(form)}`; };
  $("#pdfBtn").onclick = () => { window.open(`/api/relatorio?${qsFromForm(form)}`, "_blank"); };
  $("#deleteDayBtn")?.addEventListener("click", async () => {
    const from = form.elements.from?.value;
    const to = form.elements.to?.value;
    const date = from || to;
    if (!date || (from && to && from !== to)) {
      historyMessage.textContent = "Escolha um unico dia nos filtros De/Ate para apagar.";
      return;
    }
    if (!confirm(`Apagar todas as ocorrencias do dia ${formatDateForDisplay(date)}?`)) return;
    try {
      const result = await api(`/api/occurrences/day?date=${encodeURIComponent(date)}`, { method: "DELETE" });
      historyMessage.textContent = `${result.count} ocorrencia(s) apagada(s).`;
      await render();
    } catch (error) {
      historyMessage.textContent = error.message;
    }
  });
  $("#historyRows").addEventListener("click", async (ev) => {
    const id = ev.target.dataset.deleteOccurrence;
    if (!id) return;
    if (!confirm(`Apagar a ocorrencia numero ${id}?`)) return;
    try {
      await api(`/api/occurrences/${id}`, { method: "DELETE" });
      historyMessage.textContent = "Ocorrencia apagada.";
      await render();
    } catch (error) {
      historyMessage.textContent = error.message;
    }
  });
  await render();
}

async function initAdmin() {
  const render = async () => {
    const data = await api("/api/admin");
    $("#userRows").innerHTML = data.users.map((u) => {
      const canRemove = u.active && u.id !== window.currentUser?.id;
      return `<tr><td data-label="Nome">${u.name}</td><td data-label="Usuario">${u.username}</td><td data-label="Perfil">${u.role}</td><td data-label="Ativo">${u.active ? "Sim" : "Nao"}</td><td data-label="Acoes" class="action-cell"><button type="button" class="small-action" data-change-password="${u.id}">Senha</button><button type="button" class="danger small-action" data-delete-user="${u.id}" ${canRemove ? "" : "disabled"}>Remover</button></td></tr>`;
    }).join("");
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
  $("#userRows").addEventListener("click", async (ev) => {
    const passwordId = ev.target.dataset.changePassword;
    const deleteId = ev.target.dataset.deleteUser;
    try {
      if (passwordId) {
        const password = prompt("Digite a nova senha do usuario:");
        if (!password) return;
        await api(`/api/admin/users/${passwordId}/password`, { method: "PATCH", body: JSON.stringify({ password }) });
        $("#adminMessage").textContent = "Senha alterada com sucesso.";
      }
      if (deleteId) {
        if (!confirm("Remover o acesso deste usuario?")) return;
        await api(`/api/admin/users/${deleteId}`, { method: "DELETE" });
        $("#adminMessage").textContent = "Usuario removido/desativado.";
      }
      await render();
    } catch (error) {
      $("#adminMessage").textContent = error.message;
    }
  });
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
