# CHANGELOG

## 2026-01-23 – Release candidate (hardening transversal)

### API / Backend

#### Webhook (WhatsApp Cloud API)
- Verificación de firma `X-Hub-Signature-256` usando `META_APP_SECRET`.
- Modo configurable: `WEBHOOK_SIGNATURE_MODE=required|optional`.
- ACK inmediato (200 OK) y procesamiento posterior para minimizar reintentos.
- Idempotencia: deduplicación de mensajes entrantes por `waMessageId`.
- Parser consistente para `text`, `interactive`, `image` y `audio` (media guardada como placeholder).
- Estados (`statuses`) persistidos como `ConversationEvent(kind=WA_STATUS)` y vinculados por `waMessageId` o `recipient_id`.

#### Motor del bot (conversación)
- Memoria en `conversation.context`:
  - Corto plazo: últimos mensajes del cliente, última búsqueda, resultados recientes.
  - Largo plazo: extracción de hints del perfil (preferencias, ubicación, presupuesto) desde texto.
- Detección de frustración y control de fallbacks para evitar bucles de “no entendí”.
- Manejo de ambigüedad: pide aclaración con botones cuando la búsqueda es poco específica.
- Soporte de selección por:
  - números (1/2/3) sobre el último listado
  - IDs de botones/listas (`interactiveId`)
- Respuestas de catálogo con “máx. 3 opciones” y CTA cortos (precio, stock, link/imágenes si existen).
- Handoff humano reversible:
  - silencio automático en `HUMAN_TAKEOVER`
  - prompt de reanudar bot si el asesor no responde
  - comandos y botones para retomar o esperar asesor

#### Scheduler / Jobs
- Ejecución de jobs periódicos condicionada por `ENABLE_JOBS`.
- Lock de ejecución multi-instancia usando `pg_try_advisory_xact_lock` para evitar doble corrida en deployments con réplicas.
- Operaciones de cola/Redis (followups) ejecutadas fuera de la transacción de DB.

#### Socket.IO / Realtime
- Handshake autenticado por JWT (mismo token del login del panel).
- Redis adapter opcional si `REDIS_URL` está presente.

### Panel (Frontend)
- Cliente Socket.IO con autenticación (envía JWT en handshake).
- Cliente REST centralizado (`api.ts`) con:
  - header `Authorization`
  - manejo de 401/403 con redirección a login
  - errores consistentes
- Inbox + Chat:
  - render del último mensaje por conversación
  - takeover / devolver al bot / asignación / notas
  - actualizaciones en tiempo real con eventos `message:new` y `conversation:updated`
- TypeScript: `tsconfig.json` del panel ajustado a ES2022 + DOM.Iterable para evitar errores de build.

### Docs
- README actualizado para reflejar seguridad del realtime y ejecución de jobs en multi-instancia.
- Se agrega este `CHANGELOG.md`.
