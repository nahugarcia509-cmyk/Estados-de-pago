# Google Apps Script → backend → Supabase: paso a paso

## Qué hace y qué falta conectar

Esta opción funciona con una **Google Sheet nativa**, no con un `.xlsx` abierto en Excel. Ya existe la fuente nativa EDPs. Para otra fuente Excel: subir una copia a Drive, abrir con Google Sheets y elegir **Archivo → Guardar como Hojas de cálculo de Google**. Verificar encabezados, formatos y fechas antes de continuar. No reemplazar el archivo original.

El script adjunto crea una cola `_EDP_CHANGELOG`, captura ediciones mediante un disparador instalable y envía hasta 50 filas de cola por ejecución, cada cinco minutos o desde el menú. El primer recorrido completo es explícito y único. Los siguientes envíos no descargan el historial operativo.

Cada fuente tiene un secreto HMAC propio. **Nunca poner `service_role`, clave secreta de Supabase, contraseña de base de datos ni credenciales Google en celdas, React o GitHub.** Los editores del proyecto Apps Script pueden leer sus propiedades: restringir edición a administradores confiables y rotar el secreto cuando cambie ese acceso.

## 1. Preparar Supabase de desarrollo

1. Dar acceso al proyecto correcto `lygeqrjozogbjibgimym` a la conexión. Antes de cualquier escritura verificar nombre, organización, referencia y si es entorno de desarrollo. Si ese proyecto sirve producción, crear un entorno aislado autorizado; no ejecutar esta migración allí.
2. Seguir `SETUP.md`: aplicar migración en desarrollo, crear organización/contratista y las membresías de usuarios previamente invitados en Auth. No hay cuentas ni contraseñas predeterminadas.
3. Crear una fila `public.edp_sync_sources` para la contratista: `tenant_id` verificado, `spreadsheet_id` de la URL, `mode='push'`, `enabled=true`.
4. Definir `wbs_valid_from` y `wbs_valid_to` **con autorización contractual explícita**. Los datos WBS son ficticios y se marcarán `demonstration=true`. Sin fechas, se importan equipos/centros y se dejan tarifas pendientes en staging. No se deduce vigencia de la primera fecha operativa.
5. Generar un secreto aleatorio de al menos 32 bytes con un gestor de secretos. Guardarlo en `edp_private.source_secrets`, asociado al UUID de la fuente. Hacerlo mediante el panel SQL autorizado o un backend de administración; no pegar el secreto en archivos versionados.
6. Configurar las variables de la Edge Function exclusivamente en secretos de Supabase: `EXPECTED_SUPABASE_REF` con la referencia verificada. `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` son variables del runtime Supabase; verificar su disponibilidad. No se necesitan credenciales Google para este flujo de envío.
7. Publicar **solo en el entorno de desarrollo autorizado** la función `sheets-ingest` incluida en `supabase/functions/`. Usar la CLI instalada y consultar `supabase functions deploy --help` antes de ejecutarla. Su configuración `verify_jwt=false` permite la firma HMAC del script; el endpoint rechaza fuentes no habilitadas, firmas inválidas, timestamps mayores a cinco minutos, hojas distintas y lotes excesivos.
8. Copiar la URL real de la función desplegada. Este trabajo no desplegó ninguna función ni aplicación remota.

## 2. Instalar el script

1. Para probar, hacer una copia privada de la Sheet y crear una fuente Supabase específica para esa copia. Su ID debe coincidir exactamente con `spreadsheet_id`.
2. Abrir esa Sheet → **Extensiones → Apps Script**.
3. Copiar `integrations/apps-script/Code.gs` en el editor y guardar.
4. En **Configuración del proyecto → Propiedades del script**, agregar:

   | Propiedad           | Valor                                                                               |
   | ------------------- | ----------------------------------------------------------------------------------- |
   | `EDP_ENDPOINT`      | URL HTTPS observada de la Edge Function, terminada en `/functions/v1/sheets-ingest` |
   | `EDP_SOURCE_ID`     | UUID de `edp_sync_sources` para esta contratista/planilla                           |
   | `EDP_SOURCE_SECRET` | El mismo secreto guardado en `edp_private.source_secrets`                           |

5. Recargar la Sheet. Aparece el menú **Estados de Pago**.
6. Ejecutar **1. Instalar cola y disparadores** con la cuenta administradora de integración. Autorizar acceso a esta planilla, disparadores y solicitudes externas a la función. Revisar permisos en el diálogo de Google. No compartir esa cuenta ni contraseña.
7. Revisar en Apps Script → **Disparadores**: `edpOnEdit` al editar y `edpFlush` cada cinco minutos. Ejecutar la instalación nuevamente reemplaza únicamente estos dos disparadores, no los de otros scripts.
8. Proteger `_EDP_CHANGELOG` para que solo la cuenta de integración pueda editarla y mantenerla oculta. No ordenar, borrar, insertar filas ni modificarla manualmente: su fila es la versión monotónica. Ocultarla no reemplaza la protección.

## 3. Carga inicial y validación

1. Confirmar que las pestañas se llaman exactamente `WBS` y `Registro de operadores` y que fila 1 contiene los encabezados verificados en `SOURCE_INSPECTION.md`. No cambiar los espacios finales.
2. Ejecutar **2. Preparar carga inicial (una vez)**. Se encola primero WBS, luego partes. La marca `EDP_INITIAL_DONE` impide repetirla accidentalmente.
3. Ejecutar **Enviar pendientes ahora**. Cada ejecución procesa hasta 50 filas de cola. El disparador continuará hasta vaciarla; no hará importaciones completas repetidas.
4. Revisar **Ver estado**, ejecuciones de Apps Script y `edp_sync_runs` en Supabase. En la aplicación: Administración → Sincronización.
5. Revisar `edp_import_staging`: `review` significa que hace falta una correspondencia o decisión contractual. No equivale a error de transporte ni se considera importe aprobado.
6. Comparar conteos de IDs únicos de la fuente con partes importados + pendientes. Verificar muestra por ID, datos originales, medidores, turnos y clasificación. Las filas con errores de formato rechazan el lote entero; corregir el dato y reconciliar la captura pendiente bajo revisión administrativa. No saltar el cursor para esconder errores.
7. Cargar alias exactos en `edp_aliases`, unidades confirmadas en `edp_equipment`, y correspondencias de proyecto/área/vigencia en `edp_classifications`. No eliminar sufijos por heurística. La asignación WBS al centro de costo no se aplica silenciosamente a todos los partes.
8. Si ya se importó un registro sin clasificar, se requiere revalidación administrativa antes de facturarlo. Esta versión no incluye pantalla de reclasificación; no manipular hashes/cursor para forzarla.
9. Autorizar reglas de facturación y vigencias por contrato. OD, FS, horas extra y movimientos no se deducen automáticamente. El dashboard puede mostrar cero aprobado con partes pendientes; eso no significa deuda cero.

## 4. Probar cambios y reintentos

1. Editar una observación de un parte pendiente. Enviar pendientes. Debe actualizar el mismo registro por `(tenant_id,source_id,ID)`, conservar el original nuevo y auditar el cambio.
2. Ejecutar otra vez sin editar: no debe realizar solicitud de datos ni duplicar registros.
3. Deshabilitar temporalmente la fuente de prueba. Enviar: debe fallar y conservar la cola y el cursor. Habilitarla y reintentar: mismo UUID y contenido de lote, sin duplicados.
4. Agregar filas mientras un lote está pendiente: el lote mantiene tamaño y UUID, y las nuevas filas se procesan después.
5. Editar un parte aprobado o de período cerrado: conservar el parte histórico; el cambio queda en staging para revisión/ajuste.
6. Cargar un parte en React y luego intentar importarlo con la misma clave operativa: se rechaza la colisión, no se fusionan orígenes.

## Límites conocidos

- El disparador `onEdit` **no captura** cambios causados por fórmulas, API, otros scripts ni importaciones externas. Si esos son los productores reales, deben llamar al encolador después de escribir o implementar un journal en el productor. No se afirma una sincronización completa de esos cambios con este disparador.
- No se propagan eliminaciones. No borrar IDs ni filas históricas: registrar corrección/rechazo o ajuste. Un ID externo es inmutable. No hay eliminación silenciosa de registros Supabase.
- Captura por posición de las primeras 24/9 columnas; el backend mapea por encabezado, admite reordenamiento dentro de esas columnas y rechaza faltantes/duplicados. Si se mueven fuera de esos límites hay que ampliar la captura explícitamente.
- `getDisplayValues` conserva los textos visibles. En esta versión las cifras normalizadas deben ser números sin separadores de miles ni moneda; fechas `DD/MM/YYYY`. Valores ambiguos se rechazan para evitar cálculos incorrectos.
- Cuotas y tiempo máximo de Google Apps Script aplican. Para cargas mucho mayores, dividir el bootstrap y mover el journal a un productor/backend transaccional.
- Hay un solo emisor serial por fuente; no borrar la cola ni reiniciar sus versiones. Una nueva copia exige nueva fuente y secreto.
- El cuerpo de lote y la cola se conservan en Google; los secretos solo en propiedades protegidas/backend. Rotar actualizando ambos extremos coordinadamente.
- El envío manual autorizado está en la Sheet. La aplicación muestra estado; todavía no dispara lectura de Google desde su botón.
- No se ejecutó en Google ni se desplegó el endpoint por falta de acceso al proyecto objetivo. Pruebas locales con runtime simulado documentadas por separado.
