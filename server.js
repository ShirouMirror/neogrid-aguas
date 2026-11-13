/*
  NeoGrid · Aguas · Servidor web (sin dependencias: solo Node 18+)
  - Sirve la carpeta /public (el dashboard y los JSON exportados de SQL Server).
  - POST /api/ingest  (con clave)  recibe lecturas REALES que reenvía el puente del PC.
  - GET  /api/stream  (SSE)        el navegador recibe cada lectura al instante.
  - GET  /api/ultimas              últimas lecturas guardadas en memoria (para pintar al abrir).
  Variable de entorno obligatoria en Render:  INGEST_TOKEN  (la clave que usa el puente).
*/
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.INGEST_TOKEN || "fda1y4w42grasa777xd92fsa";
const PUBLIC = path.join(__dirname, "public");
const MAX_MEMORIA = 600;          // lecturas recientes que se recuerdan
const MAX_CUERPO = 64 * 1024;

const ultimas = [];               // [{sensor, valor, unidad, ts}]
const eventos = [];               // eventos de la maqueta
const clientes = new Set();
let ultimaRecepcion = null;

const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
};

function responder(res, codigo, cuerpo, tipo = "application/json; charset=utf-8") {
  res.writeHead(codigo, { "Content-Type": tipo, "Cache-Control": "no-store" });
  res.end(typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo));
}

function difundir(nombre, dato) {
  const texto = `event: ${nombre}\ndata: ${JSON.stringify(dato)}\n\n`;
  for (const c of clientes) c.write(texto);
}

function leerCuerpo(req) {
  return new Promise((ok, fallo) => {
    let total = 0, partes = [];
    req.on("data", (d) => {
      total += d.length;
      if (total > MAX_CUERPO) { fallo(new Error("cuerpo demasiado grande")); req.destroy(); return; }
      partes.push(d);
    });
    req.on("end", () => ok(Buffer.concat(partes).toString("utf8")));
    req.on("error", fallo);
  });
}

async function ingestar(req, res) {
  const auth = req.headers["authorization"] || "";
  if (!TOKEN || auth !== `Bearer ${TOKEN}`) return responder(res, 401, { error: "clave incorrecta" });
  let datos;
  try { datos = JSON.parse(await leerCuerpo(req)); }
  catch { return responder(res, 400, { error: "JSON inválido" }); }

  const lista = Array.isArray(datos.lecturas) ? datos.lecturas : [];
  let aceptadas = 0;
  for (const l of lista) {
    const valor = Number(l.valor);
    if (typeof l.sensor !== "string" || !Number.isFinite(valor)) continue;
    const lectura = { sensor: l.sensor.trim().toUpperCase().slice(0, 30), valor,
                      unidad: String(l.unidad || "").slice(0, 10), ts: l.ts || new Date().toISOString() };
    ultimas.push(lectura);
    if (ultimas.length > MAX_MEMORIA) ultimas.shift();
    difundir("lectura", lectura);
    aceptadas++;
  }
  if (datos.evento && typeof datos.evento === "object") {
    const e = { tipo: String(datos.evento.tipo || "").slice(0, 40), detalle: String(datos.evento.detalle || "").slice(0, 200),
                ts: new Date().toISOString() };
    eventos.push(e); if (eventos.length > 100) eventos.shift();
    difundir("evento", e);
  }
  if (aceptadas) ultimaRecepcion = new Date().toISOString();
  responder(res, 200, { aceptadas });
}

function transmitir(req, res) {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store",
                       "Connection": "keep-alive", "X-Accel-Buffering": "no" });
  res.write(": conectado\n\n");
  clientes.add(res);
  const latido = setInterval(() => res.write(": latido\n\n"), 20000);   // evita que Render cierre la conexión
  req.on("close", () => { clearInterval(latido); clientes.delete(res); });
}

function archivo(req, res, url) {
  let ruta = decodeURIComponent(url.pathname);
  if (ruta === "/") ruta = "/index.html";
  if (ruta === "/pgc" || ruta === "/pgc/") ruta = "/pgc/index.html";
  const completa = path.normalize(path.join(PUBLIC, ruta));
  if (!completa.startsWith(PUBLIC)) return responder(res, 403, "prohibido", "text/plain");
  fs.readFile(completa, (err, contenido) => {
    if (err) return responder(res, 404, "no encontrado", "text/plain");
    const tipo = TIPOS[path.extname(completa)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": tipo, "Cache-Control": ruta.startsWith("/data/") ? "no-cache" : "public, max-age=300" });
    res.end(contenido);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (req.method === "POST" && url.pathname === "/api/ingest") return await ingestar(req, res);
    if (req.method === "GET" && url.pathname === "/api/stream") return transmitir(req, res);
    if (req.method === "GET" && url.pathname === "/api/ultimas")
      return responder(res, 200, { ultimas, eventos, ultimaRecepcion, clientes: clientes.size });
    if (req.method === "GET" && url.pathname === "/api/salud") return responder(res, 200, { ok: true });
    if (req.method === "GET") return archivo(req, res, url);
    responder(res, 405, { error: "método no permitido" });
  } catch (e) {
    responder(res, 500, { error: "error interno" });
  }
}).listen(PORT, () => console.log(`NeoGrid Aguas escuchando en el puerto ${PORT}` + (TOKEN ? "" : "  (SIN INGEST_TOKEN: no aceptará lecturas)")));
