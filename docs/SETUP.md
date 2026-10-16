# Configuración técnica

Para trabajar solo desde el navegador, empezar por [VERCEL.md](VERCEL.md). Este documento describe esquema, permisos y la configuración administrativa que aún no tiene pantalla completa.

## Entornos y acceso

Destino autorizado: `lygeqrjozogbjibgimym`. La sesión no obtuvo permisos para inspeccionar sus tablas: no se aplicó ninguna migración remota y no hay usuarios creados. **No usar otro proyecto que aparezca en la cuenta.** Antes de aplicar, confirmar nombre, organización propietaria y carácter de desarrollo. La migración crea objetos con prefijo `edp_` y esquema privado `edp_private`; no borra tablas existentes.

La migración fue generada con `supabase migration new edp_core`, y probada completa en PostgreSQL embebido PGlite. Para una instalación técnica con Docker y CLI: instalar dependencias fijadas, consultar `supabase start --help`, iniciar el stack local, aplicar migraciones locales con el comando documentado por la versión instalada. No ejecutar `db push` contra un proyecto remoto por costumbre.

## Crear organización y contratistas desde SQL Editor

Una vez aplicado el esquema, ejecutar **una vez**, en desarrollo verificado:

```sql
with organization as (
 insert into public.edp_organizations(name) values ('Vicuña') returning id
), tenants as (
 insert into public.edp_tenants(organization_id,name)
 select id,'Vicuña' from organization
 union all select id,'Delta Mining' from organization
 returning id,name,organization_id
)
select * from tenants;
```

Copiar los UUID devueltos. No se crean usuarios ni tarifas en este paso. Para otras contratistas, crear otra fila bajo la misma organización; no reutilizar la empresa de otra organización.

1. Invitar usuarios reales mediante Supabase Authentication. Cada usuario define su contraseña; no crear contraseñas predeterminadas ni compartir accesos.
2. Con el UUID real del usuario Auth y el UUID real de la empresa, insertar membresía en `edp_private.memberships` (campos `user_id`, `tenant_id`, `role`).
3. Rol `vicuna` únicamente para el usuario de la empresa principal; `admin` para administrador contratista y `operator` para operador. Puede haber varias membresías/roles. Estas tablas no son editables por usuarios del navegador.
4. Verificar `edp_my_memberships()` con la sesión del usuario; no usar SQL Editor como evidencia de RLS porque su rol privilegiado omite esas políticas.

No hay permiso financiero implícito para un operador. Para autorizarlo expresamente se requiere asignación administrativa del rol apropiado; no se lee `user_metadata` para permisos.

## Catálogos, clasificación y contrato

- Configurar una fuente por contratista según [APPS_SCRIPT.md](APPS_SCRIPT.md).
- La primera importación WBS crea equipos y centros. Unidades empiezan en `unknown`. Tarifas solo se crean si la fuente tiene vigencia desde/hasta configurada. Todo valor inicial WBS se marca demostrativo.
- En **Detalle diario → Inspeccionar → Clasificar**, el administrador de la contratista elige equipo maestro, centro contractual y unidad confirmada. La operación crea un alias exacto si corresponde y conserva el registro original. Requiere justificación y se audita. Una importación posterior conserva esa clasificación mientras no cambien equipo original, proyecto o área.
- Para clasificación automática futura, un administrador de backend debe cargar `edp_classifications` con empresa, proyecto, área, centro y vigencias explícitas. La importación solo usa una correspondencia inequívoca. Si hay cero o varias, deja pendiente.
- Crear reglas en `edp_rules`: `tenant_id`, `component`, `unit`, `description`, `demonstration`, `approved_by` con usuario real que autorizó esa regla. `normal`/`extra` requieren `unit='hours'`; OD/FS necesitan la unidad contractual definida. No se crean umbrales ni cantidades por defecto.
- Las reglas son inmutables; para cambiarlas crear otra fila. Las tarifas son versiones de vigencia no superpuesta e inmutables. La UI agrega versiones de prueba, nunca convierte un precio ficticio en oficial. Una tarifa abierta bloquea versiones posteriores: planificar vigencia acotada antes de importarla; esta versión no tiene asistente para dividir una vigencia abierta.
- Las cantidades reconocidas se ingresan expresamente por un administrador. El sistema no equipara kilometraje a horas ni agrega horas extra por superar ocho horas.
- Para movilidad/desmovilidad, `edp_add_billable` admite evento independiente sin `report_id`, con fecha, centro, tarifa, regla, cantidad y motivo. Aún no existe formulario específico de eventos: no se agregan automáticamente a los partes.

## Estados, finanzas y exportación

El primer parte abre el período 26–25 correspondiente. Flujo: borrador → revisión → aprobado → cerrado. Desde revisión se puede volver a borrador. Partes pendientes impiden aprobación/cierre. Rechazar requiere motivo; reconocer un concepto exige equipo, centro, unidad y regla válidos. Un parte ya facturado queda inmutable.

Cada concepto guarda cantidad, tarifa decimal, importe redondeado a dos decimales, regla completa, indicador de demostración, usuario y motivo. Las movilizaciones son eventos separados. Cambiar una tarifa no recalcula el historial. Los ajustes autorizados se agregan como filas, incluso después del cierre; no modifican los detalles originales.

Los indicadores muestran **importes reconocidos**, no una estimación contractual inventada. Para conceptos sin configuración se muestran pendientes. Los ajustes de período se incluyen solo cuando el filtro incluye el período completo y no restringe dimensiones que el ajuste no posee. Los gráficos diarios no atribuyen ajustes a una fecha inventada.

Los filtros operativos se comparten entre tabla, KPIs y gráficos. La tabla usa páginas de 50 filas del servidor, sort allowlist y orden por ID de desempate. Exportación recorre las páginas filtradas e incluye cantidades/precios/importes reconocidos solo cuando RLS autoriza finanzas. Protege celdas frente a fórmulas CSV/Excel. Un conjunto de datos que cambie durante la exportación aún no dispone de snapshot transaccional entre páginas; exportar períodos cerrados para informes finales reproducibles.

## Seguridad

- RLS en todas las tablas públicas EDP. FK compuestas impiden enlazar equipos/centros de otra empresa.
- El alta de partes obtiene `tenant_id` del equipo verificado contra membresías del usuario. No confía en un `tenant_id` libre del formulario.
- Lectura de Vicuña limitada a su organización. Vicuña tiene supervisión financiera; las mutaciones operativas/financieras son del administrador de cada contratista.
- Sin grants de INSERT/UPDATE/DELETE a usuarios de la app. Las escrituras pasan por RPCs acotadas con validación de permisos y locks de período.
- Funciones `SECURITY DEFINER` de escritura en esquema privado, `search_path` vacío y EXECUTE revocado de PUBLIC. Wrappers de cliente `SECURITY INVOKER`. Dos RPCs exclusivamente backend (`edp_source_backend`, `edp_ingest_batch`) tienen EXECUTE solo para `service_role`; jamás entregarlo al navegador.
- `edp_my_memberships` es una lectura acotada al usuario autenticado, sin privilegios de escritura. La vista `edp_daily` usa `security_invoker`.
- Auditoría de cambios con datos previos/nuevos, identidad cuando hay sesión, fecha y entidad. Importaciones usan identidad de fuente/lote y actor humano nulo; no inventan un usuario.
- Superadministradores registrados en tabla privada no obtienen acceso automático a clientes. Un grant de soporte temporal con motivo y autorizador habilita lectura; el grant se audita. No hay panel de soporte ni auditoría por cada SELECT en esta versión.
- No se usa una clave de servicio en React. Preview Vercel solo recibe URL y clave pública del entorno verificado.

## Pruebas técnicas

```text
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm test:db
pnpm test:apps-script
pnpm build
```

En GitHub se ejecutan mediante Actions, sin tener editor instalado. No hay workflow de despliegue ni migración remota automática. Ver `TEST_RESULTS.md` y `LIMITATIONS.md` antes de considerar uso real.
