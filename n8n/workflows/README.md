# Workflows de n8n

Exportados como JSON y versionados. Se importan desde el panel de n8n:
**Workflows → Import from File**.

## Antes de importar

1. Arranca n8n:

   ```powershell
   docker compose -f docker/docker-compose.yml up -d
   ```

   Panel en http://localhost:5678

2. Arranca el puente HTTP del pipeline, en otra terminal:

   ```powershell
   pnpm osaki serve
   ```

3. En n8n, crea una credencial de tipo **Header Auth**:
   - Nombre: `Osaki`
   - Header: `x-osaki-token`
   - Valor: el mismo `N8N_WEBHOOK_TOKEN` de tu `.env`

   Los workflows la referencian por nombre.

## Por que un puente HTTP y no "Execute Command"

n8n corre dentro de Docker. Un nodo Execute Command ejecutaria **dentro del
contenedor**, donde no hay repositorio, ni Remotion, ni ffmpeg, ni tus
grabaciones. El puente corre en tu Windows, que es donde vive todo eso, y n8n
lo llama en `http://host.docker.internal:4599`.

## Los dos gates

`02-produccion.json` tiene dos nodos **Wait** en modo formulario. No son
condiciones que se puedan saltar con un flag: **son nodos del grafo**.

Nada que venga despues de un Wait puede ejecutarse antes de que tu envies el
formulario, porque n8n suspende la ejecucion ahi y la reanuda con el webhook
del formulario. Y en el grafo no existe ninguna arista que salte por encima.

Ademas, `publish` (fase 5) consultara `/videos/:id/approved/render` antes de
hacer nada, asi que aunque alguien reconectara el grafo a mano, la etapa se
negaria igual.
