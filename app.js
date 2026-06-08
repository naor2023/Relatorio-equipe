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
  document.querySelectorAll("#locationSuggestions").forEach((list) => {
    list.innerHTML = data.locations.map((x) => `<option value="${escapeHtml(x)}"></option>`).join("");
  });
  document.querySelectorAll("#typeSuggestions").forEach((list) => {
    list.innerHTML = data.types.map((x) => `<option value="${escapeHtml(x)}"></option>`).join("");
  });
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

  attachmentInput?.addEventListener("change", () => {
    attachmentName.textContent = attachmentInput.files[0]?.name || "Nenhum arquivo selecionado.";
    if (attachmentInput.files[0] && cameraInput) {
      cameraInput.value = "";
      if (cameraAttachmentName) cameraAttachmentName.textContent = "Nenhuma foto capturada.";
    }
  });

  cameraInput?.addEventListener("change", () => {
    cameraAttachmentName.textContent = cameraInput.files[0]?.name || "Nenhuma foto capturada.";
    if (cameraInput.files[0] && attachmentInput) {
      attachmentInput.value = "";
      if (attachmentName) attachmentName.textContent = "Nenhum arquivo selecionado.";
    }
  });
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
}

async function initCentral() {
  await loadCentral();
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
  events.addEventListener("occurrence-created", async () => { beep(); await loadCentral(); });
  events.addEventListener("occurrence-updated", loadCentral);
  events.onerror = () => {
    if ($("#liveState")) $("#liveState").textContent = "Online";
    if (!pollingTimer) pollingTimer = setInterval(loadCentral, 3000);
  };
  events.onopen = () => { if ($("#liveState")) $("#liveState").textContent = "Online"; };
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
  wireAttachmentLabels();
  await fillOptions().catch(() => {});
  if ($("#occurrenceForm")) {
    $("#occurrenceForm").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const form = ev.target;
      const file = form.camera_attachment.files[0] || form.attachment.files[0];
      const payload = Object.fromEntries(new FormData(form));
      delete payload.camera_attachment;
      payload.attachment = await toDataUrl(file);
      try {
        await api("/api/occurrences", { method: "POST", body: JSON.stringify(payload) });
        form.reset();
        if ($("#attachmentName")) $("#attachmentName").textContent = "Nenhum arquivo selecionado.";
        if ($("#cameraAttachmentName")) $("#cameraAttachmentName").textContent = "Nenhuma foto capturada.";
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
