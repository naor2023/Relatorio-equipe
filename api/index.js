const crypto = require("node:crypto");

const STATUSES = ["Nova", "Em atendimento", "Resolvida", "Cancelada"];

const state = global.__occurrenceState || {
  users: [],
  locations: ["Portaria Principal", "Ronda Externa", "Estacionamento", "Galpao", "Recepcao"],
  types: ["Pessoa suspeita", "Porta aberta", "Incidente operacional", "Avaria", "Emergencia", "Outro"],
  occurrences: [],
  sessions: new Map(),
  nextUserId: 1,
  nextOccurrenceId: 1,
  nextAttachmentId: 1,
  nextNoteId: 1
};
global.__occurrenceState = state;

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const test = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), test);
}

function seed() {
  if (state.users.length) return;
  addUser("Administrador", "admin", "admin123", "admin");
  addUser("Central de Monitoramento", "central", "central123", "central");
  addUser("Vigia Demo", "vigia", "vigia123", "vigia");
}

function addUser(name, username, password, role) {
  if (state.users.some((u) => u.username === username)) throw new Error("Usuario ja existe.");
  const user = {
    id: state.nextUserId++,
    name,
    username,
    password_hash: hashPassword(password),
    role,
    active: 1,
    created_at: now()
  };
  state.users.push(user);
  return user;
}

seed();

function now() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function send(res, status, payload, headers = {}) {
  res.statusCode = status;
  Object.entries({ "Content-Type": "application/json; charset=utf-8", ...headers }).forEach(([key, value]) => res.setHeader(key, value));
  res.end(JSON.stringify(payload));
}

function getCookie(req, name) {
  const parts = String(req.headers.cookie || "").split(";").map((x) => x.trim());
  const found = parts.find((x) => x.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.split("=").slice(1).join("=")) : "";
}

function currentUser(req) {
  const token = getCookie(req, "session");
  const session = token ? state.sessions.get(token) : null;
  if (!session || session.expires_at < Date.now()) return null;
  return state.users.find((u) => u.id === session.user_id && u.active);
}

function requireRole(req, res, roles) {
  const user = currentUser(req);
  if (!user) {
    send(res, 401, { error: "Login necessario." });
    return null;
  }
  if (!roles.includes(user.role)) {
    send(res, 403, { error: "Acesso negado." });
    return null;
  }
  return user;
}

function body(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 25 * 1024 * 1024) reject(new Error("Arquivo muito grande. Limite: 25 MB."));
    });
    req.on("end", () => resolve(raw ? JSON.parse(raw) : {}));
    req.on("error", reject);
  });
}

function occurrenceById(id) {
  return state.occurrences.find((x) => x.id === id) || null;
}

function filteredOccurrences(url) {
  let rows = [...state.occurrences];
  const textFilter = (key, prop) => {
    const value = url.searchParams.get(key);
    if (value) rows = rows.filter((x) => String(x[prop]).toLowerCase().includes(value.toLowerCase()));
  };
  textFilter("location", "location");
  textFilter("type", "type");
  textFilter("status", "status");
  textFilter("collaborator", "collaborator_name");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (from) rows = rows.filter((x) => x.created_at.slice(0, 10) >= from);
  if (to) rows = rows.filter((x) => x.created_at.slice(0, 10) <= to);
  return rows.sort((a, b) => b.id - a.id).slice(0, 500);
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
  const pathname = url.pathname.replace(/^\/api\/index/, "").replace(/^\/api/, "/api");

  try {
    if (req.method === "POST" && pathname === "/api/login") {
      const data = await body(req);
      const user = state.users.find((u) => u.username === data.username && u.active);
      if (!user || !verifyPassword(data.password || "", user.password_hash)) return send(res, 401, { error: "Usuario ou senha invalidos." });
      const token = crypto.randomBytes(32).toString("hex");
      state.sessions.set(token, { user_id: user.id, expires_at: Date.now() + 8 * 60 * 60 * 1000 });
      return send(res, 200, { ok: true, role: user.role, name: user.name }, { "Set-Cookie": `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800` });
    }

    if (req.method === "POST" && pathname === "/api/logout") {
      const token = getCookie(req, "session");
      if (token) state.sessions.delete(token);
      return send(res, 200, { ok: true }, { "Set-Cookie": "session=; Path=/; Max-Age=0" });
    }

    if (req.method === "GET" && pathname === "/api/me") {
      const user = currentUser(req);
      return send(res, 200, { user: user ? { id: user.id, name: user.name, username: user.username, role: user.role } : null });
    }

    if (req.method === "GET" && pathname === "/api/options") {
      requireRole(req, res, ["vigia", "central", "admin"]);
      if (res.writableEnded) return;
      return send(res, 200, { locations: state.locations, types: state.types, statuses: STATUSES });
    }

    if (req.method === "GET" && pathname === "/api/admin") {
      requireRole(req, res, ["admin"]);
      if (res.writableEnded) return;
      return send(res, 200, {
        users: state.users.map(({ password_hash, ...u }) => u),
        locations: state.locations.map((name, index) => ({ id: index + 1, name, active: 1 })),
        types: state.types.map((name, index) => ({ id: index + 1, name, active: 1 }))
      });
    }

    if (req.method === "POST" && pathname === "/api/admin/users") {
      requireRole(req, res, ["admin"]);
      if (res.writableEnded) return;
      const data = await body(req);
      if (!data.name || !data.username || !data.password || !["vigia", "central", "admin"].includes(data.role)) return send(res, 400, { error: "Dados do usuario invalidos." });
      addUser(data.name.trim(), data.username.trim(), data.password, data.role);
      return send(res, 201, { ok: true });
    }

    if (req.method === "POST" && pathname === "/api/admin/locations") {
      requireRole(req, res, ["admin"]);
      if (res.writableEnded) return;
      const data = await body(req);
      if (!data.name) return send(res, 400, { error: "Informe o local." });
      state.locations.push(data.name.trim());
      return send(res, 201, { ok: true });
    }

    if (req.method === "POST" && pathname === "/api/admin/types") {
      requireRole(req, res, ["admin"]);
      if (res.writableEnded) return;
      const data = await body(req);
      if (!data.name) return send(res, 400, { error: "Informe o tipo." });
      state.types.push(data.name.trim());
      return send(res, 201, { ok: true });
    }

    if (req.method === "POST" && pathname === "/api/occurrences") {
      const user = requireRole(req, res, ["vigia", "central", "admin"]);
      if (!user) return;
      const data = await body(req);
      if (!data.collaborator_name || !data.location || !data.type || !data.description) return send(res, 400, { error: "Preencha todos os campos obrigatorios." });
      const item = {
        id: state.nextOccurrenceId++,
        collaborator_name: data.collaborator_name.trim(),
        location: data.location.trim(),
        type: data.type.trim(),
        description: data.description.trim(),
        status: "Nova",
        created_at: now(),
        updated_at: now(),
        created_by: user.id,
        attachments: data.attachment ? [{
          id: state.nextAttachmentId++,
          original_name: data.attachment.name || "anexo",
          file_path: data.attachment.dataUrl,
          mime_type: String(data.attachment.dataUrl).match(/^data:([^;]+)/)?.[1] || "application/octet-stream",
          created_at: now()
        }] : [],
        notes: []
      };
      state.occurrences.push(item);
      return send(res, 201, { ok: true, occurrence: item });
    }

    if (req.method === "GET" && pathname === "/api/occurrences") {
      requireRole(req, res, ["central", "admin"]);
      if (res.writableEnded) return;
      return send(res, 200, { occurrences: filteredOccurrences(url) });
    }

    const match = pathname.match(/^\/api\/occurrences\/(\d+)$/);
    if (match && req.method === "GET") {
      requireRole(req, res, ["central", "admin"]);
      if (res.writableEnded) return;
      const item = occurrenceById(Number(match[1]));
      return item ? send(res, 200, { occurrence: item }) : send(res, 404, { error: "Ocorrencia nao encontrada." });
    }

    if (match && req.method === "PATCH") {
      const user = requireRole(req, res, ["central", "admin"]);
      if (!user) return;
      const item = occurrenceById(Number(match[1]));
      if (!item) return send(res, 404, { error: "Ocorrencia nao encontrada." });
      const data = await body(req);
      if (data.status && !STATUSES.includes(data.status)) return send(res, 400, { error: "Status invalido." });
      if (data.status) item.status = data.status;
      if (data.note) item.notes.unshift({ id: state.nextNoteId++, occurrence_id: item.id, user_id: user.id, user_name: user.name, note: data.note.trim(), created_at: now() });
      item.updated_at = now();
      return send(res, 200, { ok: true, occurrence: item });
    }

    if (req.method === "GET" && pathname === "/api/export.csv") {
      requireRole(req, res, ["central", "admin"]);
      if (res.writableEnded) return;
      const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
      const rows = filteredOccurrences(url);
      const csv = ["Numero,Data,Colaborador,Local,Tipo,Descricao,Status", ...rows.map((r) => [r.id, r.created_at, r.collaborator_name, r.location, r.type, r.description, r.status].map(esc).join(","))].join("\r\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=ocorrencias.csv");
      return res.end(csv);
    }

    if (req.method === "GET" && pathname === "/api/relatorio") {
      requireRole(req, res, ["central", "admin"]);
      if (res.writableEnded) return;
      const tr = filteredOccurrences(url).map((r) => `<tr><td>${r.id}</td><td>${r.created_at}</td><td>${r.collaborator_name}</td><td>${r.location}</td><td>${r.type}</td><td>${r.description}</td><td>${r.status}</td></tr>`).join("");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.end(`<!doctype html><html><head><meta charset="utf-8"><title>Relatorio</title><style>body{font-family:Arial;margin:32px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px;text-align:left}th{background:#111827;color:white}</style></head><body><h1>Relatorio de Ocorrencias</h1><p>Use Ctrl+P e escolha salvar como PDF.</p><table><thead><tr><th>N.</th><th>Data</th><th>Colaborador</th><th>Local</th><th>Tipo</th><th>Descricao</th><th>Status</th></tr></thead><tbody>${tr}</tbody></table><script>print()</script></body></html>`);
    }

    return send(res, 404, { error: "Rota nao encontrada." });
  } catch (error) {
    return send(res, 500, { error: error.message || "Erro interno." });
  }
};
