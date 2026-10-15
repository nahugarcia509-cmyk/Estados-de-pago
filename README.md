# Estados de Pago | Vicuña

Primera versión de desarrollo de una plataforma multiempresa para partes diarios y estados de pago de contratistas. React + TypeScript + Tailwind, Supabase Auth/PostgreSQL/RLS, sincronización incremental desde Google Sheets y dashboard financiero.

## Usar desde GitHub y Vercel, sin VS Code

**Empezar aquí: [Manual de Vercel y configuración desde el navegador](docs/VERCEL.md).**

- [Apps Script: código e instalación paso a paso](docs/APPS_SCRIPT.md)
- [Código para pegar en Apps Script](integrations/apps-script/Code.gs)
- [Backend autocontenido para el editor de Supabase](integrations/supabase-editor/sheets-ingest.ts)
- [Migración SQL y RLS](supabase/migrations/20261015233220_edp_core.sql)
- [Configuración de empresas, usuarios y contrato](docs/SETUP.md)
- [Resultados de pruebas](docs/TEST_RESULTS.md)
- [Limitaciones y pendientes](docs/LIMITATIONS.md)
- [Inspección de la fuente EDPs](docs/SOURCE_INSPECTION.md)

## Estado de entrega

Implementación en `develop/edp-v1`, con PR para revisión. `main` no se fusiona ni despliega a producción automáticamente. La configuración Vercel bloquea auto-deploy de `main`.

**No está conectado ni validado remotamente todavía:** el proyecto Supabase solicitado devuelve permiso denegado; Vercel devuelve 403 en el alcance de proyectos. No se sustituyeron por otros proyectos ni por recursos de Delta Mining OPS. No hay credenciales predeterminadas ni secretos versionados.

## Qué incluye

- Autenticación, roles y aislamiento en la base, con permisos financieros separados de operaciones.
- Partes diarios nativos y sincronizados con origen, ID externo, datos originales y auditoría.
- Mapeo literal de encabezados con espacios finales, alias exactos y clasificación autorizada.
- Equipos, centros, tarifas versionadas, cantidades reconocidas y snapshots de reglas/precios.
- Períodos 26–25 en fechas operativas San Juan, revisión/cierre y ajustes trazables.
- KPIs/gráficos de datos Supabase, filtros combinados, detalle paginado y exportación CSV/Excel.
- Apps Script con cola incremental, HMAC por fuente, reintentos y backend idempotente.
- Pruebas locales reproducibles y workflow GitHub sin credenciales remotas.

Las reglas OD/FS, extra y movimientos requieren configuración contractual explícita; los valores WBS son demostrativos. No se calculan horas desde kilómetros ni se repiten movilizaciones por parte. Consultar limitaciones antes de considerar el sistema apto para uso real.

## Estructura

`src/` contiene autenticación, interfaz y servicios; `shared/` las reglas de fechas/mapeo/decimales; `supabase/` esquema y backend; `integrations/` instaladores desde navegador; `tests/` y `scripts/` las verificaciones; `docs/` los manuales.

## Desarrollo opcional

Node 24 y pnpm 11.25.0. Crear `.env.local` a partir de `.env.example` con URL y clave pública del entorno de desarrollo verificado. Ejecutar `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test`, `pnpm test:db`, `pnpm test:apps-script`, `pnpm build` y `pnpm dev`. No es necesario para usar la vía Vercel/GitHub documentada arriba.
