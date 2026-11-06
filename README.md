# NeoGrid Aguas · tablero en vivo

Solo muestra lo que llega de la maqueta: nivel de T1 y T2, flujo, bomba y alertas.
Camino de los datos: maqueta -> broker MQTT -> `puente_mqtt.py` (tu PC) -> esta pagina en Render.

## Archivos
- `server.js`: servidor sin dependencias. Recibe lecturas en `/api/ingest` (con clave) y las reparte al navegador.
- `public/index.html`: el tablero.

## En Render
- New + > Web Service > repositorio de GitHub.
- Runtime: Node. Build Command: (vacio o `npm install`). Start Command: `node server.js`.
- Environment > agregar `INGEST_TOKEN` con una clave larga inventada por ti.

## En tu PC (donde corre el puente), en cmd
    set NEOGRID_WEB_URL=https://TU-PAGINA.onrender.com
    set NEOGRID_WEB_TOKEN=la_misma_clave_de_INGEST_TOKEN
    python puente_mqtt.py

## Probar sin maqueta
Abre la pagina y pulsa "Iniciar prueba local" (lecturas inventadas, solo en tu navegador).
