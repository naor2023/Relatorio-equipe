const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = __dirname;
const PUBLIC = ROOT;
const USE_POSTGRES = Boolean(process.env.DATABASE_URL);
const STORAGE_ROOT = process.env.APP_DATA_DIR ? path.resolve(process.env.APP_DATA_DIR) : null;
const STORAGE_MODE = USE_POSTGRES ? "external-postgres" : (STORAGE_ROOT ? "persistent-sqlite" : "ephemeral-sqlite");
const DATA = STORAGE_ROOT ? path.join(STORAGE_ROOT, "database") : path.join(ROOT, "data");
const UPLOADS = STORAGE_ROOT ? path.join(STORAGE_ROOT, "uploads") : path.join(DATA, "uploads");
const LEGACY_UPLOADS = path.join(ROOT, "public", "uploads");
const DB_FILE = path.join(DATA, "ocorrencias.sqlite");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_URL = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || `http://localhost:${PORT}`;
const STATUSES = ["Nova", "Em atendimento", "Resolvida", "Cancelada"];

fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(UPLOADS, { recursive: true });
fs.mkdirSync(LEGACY_UPLOADS, { recursive: true });

let sqliteDb = null;
let pgPool = null;

if (USE_POSTGRES) {
  const { Pool } = require("pg");
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
  });
} else {
  const { DatabaseSync } = require("node:sqlite");
  sqliteDb = new DatabaseSync(DB_FILE);
}

function toPgSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

async function exec(sql) {
  if (USE_POSTGRES) {
    await pgPool.query(sql);
    return;
  }
  sqliteDb.exec(sql);
}

async function get(sql, args = []) {
  if (USE_POSTGRES) {
    const result = await pgPool.query(toPgSql(sql), args);
    return result.rows[0] || null;
  }
  return sqliteDb.prepare(sql).get(...args) || null;
}

async function all(sql, args = []) {
  if (USE_POSTGRES) {
    const result = await pgPool.query(toPgSql(sql), args);
    return result.rows;
  }
  return sqliteDb.prepare(sql).all(...args);
}

async function run(sql, args = []) {
  if (USE_POSTGRES) {
    await pgPool.query(toPgSql(sql), args);
    return;
  }
  sqliteDb.prepare(sql).run(...args);
}

async function insertId(sql, args = []) {
  if (USE_POSTGRES) {
    const result = await pgPool.query(`${toPgSql(sql)} RETURNING id`, args);
    return result.rows[0].id;
  }
  return Number(sqliteDb.prepare(sql).run(...args).lastInsertRowid);
}

async function initDatabase() {
  if (USE_POSTGRES) {
    await exec(`
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('vigia','central','admin')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE TABLE IF NOT EXISTS locations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS occurrence_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS occurrences (
  id SERIAL PRIMARY KEY,
  collaborator_name TEXT NOT NULL,
  location TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Nova',
  created_at TEXT NOT NULL DEFAULT to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT NOT NULL DEFAULT to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'),
  created_by INTEGER,
  FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS attachments (
  id SERIAL PRIMARY KEY,
  occurrence_id INTEGER NOT NULL,
  original_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'),
  FOREIGN KEY(occurrence_id) REFERENCES occurrences(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS notes (
  id SERIAL PRIMARY KEY,
  occurrence_id INTEGER NOT NULL,
  user_id INTEGER,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'),
  FOREIGN KEY(occurrence_id) REFERENCES occurrences(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at BIGINT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);
    return;
  }

  await exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('vigia','central','admin')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS occurrence_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS occurrences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collaborator_name TEXT NOT NULL,
  location TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Nova',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurrence_id INTEGER NOT NULL,
  original_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(occurrence_id) REFERENCES occurrences(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurrence_id INTEGER NOT NULL,
  user_id INTEGER,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(occurrence_id) REFERENCES occurrences(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const test = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), test);
}

async function seed() {
  const users = [
    ["Administrador", "admin", "admin123", "admin"],
    ["Central de Monitoramento", "central", "central123", "central"],
    ["Central Portaria", "portaria", "portaria123", "central"],
    ["Vigia Demo", "vigia", "vigia123", "vigia"]
  ];
  for (const [name, username, password, role] of users) {
    if (!(await get("SELECT 1 FROM users WHERE username = ? LIMIT 1", [username]))) {
      await run("INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)", [name, username, hashPassword(password), role]);
    }
  }

  for (const name of ["Portaria Principal", "Ronda Externa", "Estacionamento", "Galpao", "Recepcao"]) {
    if (USE_POSTGRES) await run("INSERT INTO locations (name) VALUES (?) ON CONFLICT (name) DO NOTHING", [name]);
    else await run("INSERT OR IGNORE INTO locations (name) VALUES (?)", [name]);
  }

  for (const name of ["Pessoa suspeita", "Porta aberta", "Incidente operacional", "Avaria", "Emergencia", "Outro"]) {
    if (USE_POSTGRES) await run("INSERT INTO occurrence_types (name) VALUES (?) ON CONFLICT (name) DO NOTHING", [name]);
    else await run("INSERT OR IGNORE INTO occurrence_types (name) VALUES (?)", [name]);
  }
}

const clients = new Set();
function broadcast(type, data) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(payload);
}

function cookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map((part) => {
    const [key, ...value] = part.trim().split("=");
    return [key, decodeURIComponent(value.join("="))];
  }));
}

async function currentUser(req) {
  const token = cookies(req).session;
  if (!token) return null;
  return await get(`
    SELECT u.id, u.name, u.username, u.role
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ? AND u.active = 1
  `, [token, Date.now()]);
}

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function contentType(filePath) {
  const types = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".pdf": "application/pdf"
  };
  return `${types[path.extname(filePath).toLowerCase()] || "application/octet-stream"}; charset=utf-8`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 25 * 1024 * 1024) {
        reject(new Error("Arquivo muito grande. Limite: 25 MB."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body ? JSON.parse(body) : {}));
    req.on("error", reject);
  });
}

async function requireRole(req, res, roles) {
  const user = await currentUser(req);
  if (!user) {
    if (req.url.startsWith("/api/")) json(res, 401, { error: "Login necessario." });
    else redirect(res, "/login.html");
    return null;
  }
  if (!roles.includes(user.role)) {
    json(res, 403, { error: "Acesso negado." });
    return null;
  }
  return user;
}

async function occurrenceById(id) {
  const item = await get("SELECT * FROM occurrences WHERE id = ?", [id]);
  if (!item) return null;
  item.attachments = await all("SELECT * FROM attachments WHERE occurrence_id = ?", [id]);
  item.notes = await all(`
    SELECT n.*, COALESCE(u.name, 'Central') AS user_name
    FROM notes n LEFT JOIN users u ON u.id = n.user_id
    WHERE n.occurrence_id = ? ORDER BY n.created_at DESC
  `, [id]);
  return item;
}

async function saveAttachment(occurrenceId, attachment) {
  if (!attachment || !attachment.dataUrl) return;
  const match = attachment.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return;
  const mime = match[1];
  const ext = (attachment.name || "arquivo").split(".").pop().replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  const safeName = `${occurrenceId}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
  const rel = `/uploads/${safeName}`;
  fs.writeFileSync(path.join(UPLOADS, safeName), Buffer.from(match[2], "base64"));
  await run("INSERT INTO attachments (occurrence_id, original_name, file_path, mime_type) VALUES (?, ?, ?, ?)", [occurrenceId, attachment.name || safeName, rel, mime]);
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/") || url.pathname === "/events") return false;
  if (url.pathname.startsWith("/uploads/")) {
    const uploadName = decodeURIComponent(url.pathname.slice("/uploads/".length));
    const candidates = [
      path.normalize(path.join(UPLOADS, uploadName)),
      path.normalize(path.join(LEGACY_UPLOADS, uploadName))
    ];
    const uploadPath = candidates.find((candidate) => (
      (candidate.startsWith(UPLOADS) || candidate.startsWith(LEGACY_UPLOADS)) &&
      fs.existsSync(candidate)
    ));
    if (!uploadPath) return false;
    res.writeHead(200, { "Content-Type": contentType(uploadPath) });
    fs.createReadStream(uploadPath).pipe(res);
    return true;
  }
  let filePath = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname)));
  if (!filePath.startsWith(PUBLIC)) return json(res, 403, { error: "Acesso negado." });
  if (fs.statSync(filePath, { throwIfNoEntry: false })?.isDirectory()) filePath = path.join(filePath, "index.html");
  if (!fs.existsSync(filePath)) return false;
  res.writeHead(200, { "Content-Type": contentType(filePath) });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

async function filteredOccurrences(url) {
  const where = [];
  const args = [];
  const likeOperator = USE_POSTGRES ? "ILIKE" : "LIKE";
  const map = { location: "location", type: "type", status: "status", collaborator: "collaborator_name" };
  for (const [key, col] of Object.entries(map)) {
    const val = url.searchParams.get(key);
    if (val) {
      where.push(`${col} ${likeOperator} ?`);
      args.push(`%${val}%`);
    }
  }
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (from) { where.push(USE_POSTGRES ? "created_at::date >= ?::date" : "date(created_at) >= date(?)"); args.push(from); }
  if (to) { where.push(USE_POSTGRES ? "created_at::date <= ?::date" : "date(created_at) <= date(?)"); args.push(to); }
  const order = USE_POSTGRES ? "created_at::timestamp DESC, id DESC" : "datetime(created_at) DESC, id DESC";
  const sql = `SELECT * FROM occurrences ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ${order}`;
  return await all(sql, args);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === "GET" && url.pathname === "/healthz") {
      await get("SELECT 1 AS ok");
      return json(res, 200, {
        ok: true,
        database: USE_POSTGRES ? "postgres" : "sqlite",
        storageMode: STORAGE_MODE,
        appDataDir: STORAGE_ROOT,
        sqliteFile: USE_POSTGRES ? null : DB_FILE,
        uploads: UPLOADS
      });
    }

    if (req.method === "GET" && url.pathname === "/events") {
      const user = await requireRole(req, res, ["central", "admin"]);
      if (!user) return;
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      });
      res.write("event: ready\ndata: {}\n\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/login") {
      const body = await readBody(req);
      const user = await get("SELECT * FROM users WHERE username = ? AND active = 1", [body.username || ""]);
      if (!user || !verifyPassword(body.password || "", user.password_hash)) return json(res, 401, { error: "Usuario ou senha invalidos." });
      const token = crypto.randomBytes(32).toString("hex");
      await run("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", [token, user.id, Date.now() + 8 * 60 * 60 * 1000]);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Set-Cookie": `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800` });
      res.end(JSON.stringify({ ok: true, role: user.role, name: user.name }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/logout") {
      const token = cookies(req).session;
      if (token) await run("DELETE FROM sessions WHERE token = ?", [token]);
      res.writeHead(200, { "Set-Cookie": "session=; Path=/; Max-Age=0" });
      res.end("ok");
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/me") return json(res, 200, { user: await currentUser(req) });

    if (req.method === "GET" && url.pathname === "/api/options") {
      return json(res, 200, {
        locations: (await all("SELECT name FROM locations WHERE active = 1 ORDER BY name")).map((x) => x.name),
        types: (await all("SELECT name FROM occurrence_types WHERE active = 1 ORDER BY name")).map((x) => x.name),
        statuses: STATUSES
      });
    }

    if (req.method === "GET" && url.pathname === "/api/admin") {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      return json(res, 200, {
        users: await all("SELECT id, name, username, role, active, created_at FROM users ORDER BY name"),
        locations: await all("SELECT * FROM locations ORDER BY name"),
        types: await all("SELECT * FROM occurrence_types ORDER BY name")
      });
    }

    if (req.method === "POST" && url.pathname === "/api/admin/users") {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      const body = await readBody(req);
      if (!body.name || !body.username || !body.password || !["vigia", "central", "admin"].includes(body.role)) {
        return json(res, 400, { error: "Dados do usuario invalidos." });
      }
      await run("INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)", [body.name.trim(), body.username.trim(), hashPassword(body.password), body.role]);
      return json(res, 201, { ok: true });
    }

    if (req.method === "POST" && url.pathname === "/api/admin/locations") {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      const body = await readBody(req);
      if (!body.name) return json(res, 400, { error: "Informe o local." });
      await run("INSERT INTO locations (name) VALUES (?)", [body.name.trim()]);
      return json(res, 201, { ok: true });
    }

    if (req.method === "POST" && url.pathname === "/api/admin/types") {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;
      const body = await readBody(req);
      if (!body.name) return json(res, 400, { error: "Informe o tipo." });
      await run("INSERT INTO occurrence_types (name) VALUES (?)", [body.name.trim()]);
      return json(res, 201, { ok: true });
    }

    if (req.method === "POST" && url.pathname === "/api/occurrences") {
      const body = await readBody(req);
      if (!body.collaborator_name || !body.location || !body.type || !body.description) return json(res, 400, { error: "Preencha todos os campos obrigatorios." });
      const id = await insertId(`
        INSERT INTO occurrences (collaborator_name, location, type, description, status, created_by)
        VALUES (?, ?, ?, ?, 'Nova', ?)
      `, [body.collaborator_name.trim(), body.location.trim(), body.type.trim(), body.description.trim(), null]);
      await saveAttachment(id, body.attachment);
      const item = await occurrenceById(id);
      broadcast("occurrence-created", item);
      return json(res, 201, { ok: true, occurrence: item });
    }

    if (req.method === "GET" && url.pathname === "/api/occurrences") {
      const user = await requireRole(req, res, ["central", "admin"]);
      if (!user) return;
      return json(res, 200, { occurrences: await filteredOccurrences(url) });
    }

    const occurrenceMatch = url.pathname.match(/^\/api\/occurrences\/(\d+)$/);
    if (occurrenceMatch && req.method === "GET") {
      const user = await requireRole(req, res, ["central", "admin"]);
      if (!user) return;
      const item = await occurrenceById(Number(occurrenceMatch[1]));
      return item ? json(res, 200, { occurrence: item }) : json(res, 404, { error: "Ocorrencia nao encontrada." });
    }

    if (occurrenceMatch && req.method === "PATCH") {
      const user = await requireRole(req, res, ["central", "admin"]);
      if (!user) return;
      const id = Number(occurrenceMatch[1]);
      const body = await readBody(req);
      if (body.status && !STATUSES.includes(body.status)) return json(res, 400, { error: "Status invalido." });
      if (body.status) await run("UPDATE occurrences SET status = ?, updated_at = ? WHERE id = ?", [body.status, now(), id]);
      if (body.note) await run("INSERT INTO notes (occurrence_id, user_id, note) VALUES (?, ?, ?)", [id, user.id, body.note.trim()]);
      const item = await occurrenceById(id);
      broadcast("occurrence-updated", item);
      return json(res, 200, { ok: true, occurrence: item });
    }

    if (req.method === "GET" && url.pathname === "/api/export.csv") {
      const user = await requireRole(req, res, ["central", "admin"]);
      if (!user) return;
      const rows = await filteredOccurrences(url);
      const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
      const csv = ["Numero,Data,Colaborador,Local,Tipo,Descricao,Status", ...rows.map((r) => [r.id, r.created_at, r.collaborator_name, r.location, r.type, r.description, r.status].map(esc).join(","))].join("\r\n");
      res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=ocorrencias.csv" });
      res.end(csv);
      return;
    }

    if (req.method === "GET" && (url.pathname === "/relatorio.html" || url.pathname === "/api/relatorio")) {
      const user = await requireRole(req, res, ["central", "admin"]);
      if (!user) return;
      const rows = await filteredOccurrences(url);
      const tr = rows.map((r) => `<tr><td>${r.id}</td><td>${r.created_at}</td><td>${r.collaborator_name}</td><td>${r.location}</td><td>${r.type}</td><td>${r.description}</td><td>${r.status}</td></tr>`).join("");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><html><head><meta charset="utf-8"><title>Relatorio</title><style>body{font-family:Arial;margin:32px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px;text-align:left}th{background:#111827;color:white}</style></head><body><h1>Relatorio de Ocorrencias</h1><p>Use Ctrl+P e escolha salvar como PDF.</p><table><thead><tr><th>N.</th><th>Data</th><th>Colaborador</th><th>Local</th><th>Tipo</th><th>Descricao</th><th>Status</th></tr></thead><tbody>${tr}</tbody></table><script>print()</script></body></html>`);
      return;
    }

    if (req.method === "GET" && serveStatic(req, res)) return;
    json(res, 404, { error: "Rota nao encontrada." });
  } catch (error) {
    json(res, 500, { error: error.message || "Erro interno." });
  }
});

function now() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

async function start() {
  await initDatabase();
  await seed();
  server.listen(PORT, HOST, () => {
    console.log(`Sistema de ocorrencias rodando em ${PUBLIC_URL}`);
    console.log(`Database: ${USE_POSTGRES ? "postgres" : "sqlite"}`);
    console.log(`Storage mode: ${STORAGE_MODE}`);
    console.log(`Uploads directory: ${UPLOADS}`);
    if (!USE_POSTGRES) console.log(`SQLite file: ${DB_FILE}`);
    if (!USE_POSTGRES && !STORAGE_ROOT && process.env.RENDER) {
      console.warn("DATABASE_URL nao definido no Render. O SQLite local sera resetado em redeploy/restart.");
    }
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
