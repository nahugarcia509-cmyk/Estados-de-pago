# Resultados de pruebas — 15/10/2026

## Resultado local observado

| Capa                                | Resultado                   | Evidencia                                                                                                                                                                                                         |
| ----------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript React                    | Aprobado                    | `tsc -b`, sin errores                                                                                                                                                                                             |
| TypeScript backend                  | Aprobado                    | `tsc -p tsconfig.edge.json`, sin errores                                                                                                                                                                          |
| Dominio                             | 18 pruebas aprobadas        | Vitest: períodos inclusive 26–25, diciembre/enero, año bisiesto, fechas inválidas, importes decimales, encabezados/espacios, hash estable, alias explícitos, km/horas                                             |
| Handler HTTP Edge Function          | 7 pruebas aprobadas         | Vitest con cliente Supabase simulado: HMAC válido/incorrecto, timestamp expirado, hoja distinta, encabezados, ID repetido y método GET                                                                            |
| PostgreSQL/RLS                      | 52 verificaciones aprobadas | `node scripts/test-db.mjs`, migración real ejecutada íntegra en PGlite/PostgreSQL, roles anon/authenticated/service y función auth.uid simulada                                                                   |
| Apps Script                         | 5 verificaciones aprobadas  | `node scripts/test-apps-script.mjs`, runtime Google simulado: cursor retenido tras fallo, mismo lote con filas nuevas, firma comprobada con implementación independiente, siguiente lote y cero envío sin cambios |
| Bundle Vite                         | Aprobado                    | Compilación completa; advertencia de tamaño ExcelJS, carga diferida                                                                                                                                               |
| Navegador                           | No realizado                | Apertura del origen local denegada por revisión de permisos; no se eludió el bloqueo                                                                                                                              |
| Supabase Auth y proyecto remoto     | No realizado                | Proyecto destino devuelve permiso denegado                                                                                                                                                                        |
| Google → Edge desplegada → Supabase | No realizado                | Endpoint no desplegado y script no instalado                                                                                                                                                                      |
| Vercel remoto                       | No realizado                | Alcance de proyectos devuelve HTTP 403                                                                                                                                                                            |

Total: **82 pruebas/verificaciones locales aprobadas** (25 Vitest + 52 PostgreSQL + 5 Apps Script). El test de base usa PostgreSQL real embebido, pero no reproduce PostgREST, emisión/revocación JWT, proveedores de correo ni infraestructura Supabase remota.

## Cobertura de base de datos

Se probaron lectura/escritura/eliminación entre empresas, elevación de membresías denegada, lectura Vicuña dentro de su organización, exclusión de otra organización, superadmin sin acceso implícito, operador sin precios/importes/auditoría financiera, ausencia de importe en respuesta de detalle para operador, FK compuestas, duplicados operativos, decimal exacto, allowlist de orden, aprobación sin regla denegada, tarifa histórica inmutable y no superpuesta, nuevo precio sin cambio del importe cerrado, transición/cierre, parte nuevo bloqueado en cierre, reapertura denegada, ajuste posterior auditado, RLS en todas las tablas públicas EDP y denegación anónima de datos y secretos.

La sincronización se probó por lotes SQL: reintento, cambios modificados, evento fuera de orden, contenido idéntico sin reescritura, cursor confirmado, falta de alias/centro pendiente, WBS inicial con vigencia explícita, idempotencia WBS, cambios WBS retenidos para revisión, clasificación explícita y preservación tras sincronización, rechazo con motivo y bloqueo de facturación de km como horas.

El lock de sincronización y lock de período están implementados; no se ejecutó una prueba de carreras entre conexiones independientes. El runtime PGlite de estas pruebas es de una sola conexión.

## Validaciones aún necesarias para aceptar uso real

Entrar con usuarios reales de dos contratistas y Vicuña; intentar acceso cruzado desde PostgREST con sus tokens; probar expiración/revocación; instalar script en copia privada; verificar encabezados/formato de todas las filas, IDs y equipos; reconciliar conteos; validar vigencias/reglas con responsables del contrato; confirmar que dashboards/tablas/exportaciones coincidan con cálculos firmados; probar cierre y cambio tardío concurrente; inspeccionar UI responsive y accesibilidad en navegador; ejecutar asesores de Supabase en el entorno remoto autorizado.

El workflow GitHub está incluido; su ejecución remota se informa por separado en el PR. No se afirma que un check remoto haya pasado solo por haber agregado su definición.
