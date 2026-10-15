# Alcance real y pendientes

## Implementado y probado localmente

React/TypeScript/Tailwind; Supabase Auth por correo/contraseña; navegación por rol; formulario de partes; SQL multiempresa con RLS y FK compuestas; RPCs con autorizaciones; datos originales y auditoría; catálogo y tarifas de vigencia; clasificación explícita; componentes financieros con snapshots decimales; período 26–25; revisión/cierre/ajustes; consultas agregadas filtradas; detalle paginado; exportación CSV/Excel; dashboard sin valores inventados; integración HMAC Apps Script y cola incremental; CI de pruebas sin secretos; configuración Vercel Preview.

“Probado localmente” no significa que cada interacción gráfica o integración externa haya sido ejecutada. Los resultados y límites por capa están en `TEST_RESULTS.md`.

## Accesos bloqueados y verificaciones externas pendientes

1. Supabase `lygeqrjozogbjibgimym`: permiso denegado en las dos conexiones, inclusive tras reconexión. Sin esquema remoto inspeccionado, migración remota, usuarios Auth, importación real ni comparación de totales contra fuente completa.
2. Vercel: cuenta reconocida pero alcance de proyectos devuelve 403; sin Preview creada. Preparado para importar desde GitHub; manual sin VS Code en `VERCEL.md`.
3. Navegador local: revisión de permisos rechazó abrir el origen local. No se verificó visualmente ni se ejecutó recorrido de usuario en navegador. No se intentó eludir ese bloqueo.
4. Apps Script: probado en un runtime simulado, no instalado en Google ni probado contra una Edge Function desplegada.
5. No se encontró `EDPs.xlsx`. Se verificaron encabezados y muestras de la Google Sheet EDPs, no todas sus filas. No se publicó información operativa real en el repositorio.

## Funcionalidad parcial / no implementada

- No hay CRUD completo de empresas, usuarios/roles, fuentes y reglas desde la interfaz. Provisionamiento/invitaciones/configuración inicial mediante Supabase dashboard y SQL autorizado. La vista de usuarios muestra las membresías del usuario actual, no un directorio completo.
- No hay panel SUPERADMIN ni soporte con autorización de cliente desde UI; están las tablas y control de acceso temporal. Se auditan grants y mutaciones, no cada lectura de soporte.
- No hay editor visual de reglas OD/FS, unidad contractual, períodos de vigencia de reglas o cálculo automático de horas extra. Se exige regla aprobada y cantidad reconocida manualmente. La vigencia de precios sí se controla. Las reglas no se deducen de datos ficticios.
- No hay pantalla dedicada de movilizaciones/desmovilizaciones: el backend admite eventos independientes. No se repiten por parte.
- No hay generación de PDF ni exportación de resumen de cierre independiente; CSV/Excel de detalle con importes y trazabilidad están implementados.
- No hay importación directa de `.xlsx`; se usa Google Sheet nativa. La sincronización implementada es envío por Apps Script. `pull` queda reservado en esquema, sin trabajador lector Google ni cuenta de servicio configurada. No poner una fuente en ese modo esperando que se ejecute.
- El botón Actualizar refresca Supabase, no consulta Google. El envío manual y el disparador automático están en Apps Script.
- No hay reconciliación automática de eliminaciones, cambios de ID, fórmulas/API u otros scripts. Esos productores requieren journal explícito; detalles en `APPS_SCRIPT.md`.
- No hay corrección de parte nativo desde UI: se conserva el alta y se revisa/rechaza/clasifica; correcciones posteriores a facturación requieren ajustes.
- Los catálogos y vistas de auditoría/sincronización tienen tope visible de 500 filas. Detalle diario está paginado en servidor; faltan búsqueda/paginación completa de catálogos grandes. No hay caché compartida sofisticada ni tiempo real; refresh explícito evita polling excesivo.
- KPIs y gráficos usan cantidades reconocidas. No se presenta una estimación de deuda basada en reglas desconocidas. No se ha validado rendimiento con cientos de miles de partes ni concurrencia real de múltiples conexiones.
- La UI no tiene modo oscuro; Operaciones avanzado y Seguridad figuran estructuralmente para el futuro.
- ExcelJS genera un chunk de aproximadamente 940 kB minificado, cargado solamente al solicitar exportación.
- No hay validación contractual externa ni revisión comercial final. No tratar tarifas DEMO como precios oficiales.

## Decisiones contractuales pendientes

Responsable y alcance de aprobación/cierre; vigencias oficiales de WBS; unidades de medidores; alias equipo/proyecto; correspondencias temporales de centros de costo; horas reconocidas; horas extra; unidad y aplicación OD/FS; movimientos; ajustes; definición de estados estimado/pendiente/aprobado/definitivo y políticas de exportación.

No se desplegó producción ni se modificó Delta Mining OPS.
