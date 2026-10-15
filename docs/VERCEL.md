# Ejecutar desde GitHub y Vercel, sin VS Code

Todo el código está en GitHub. No necesitás instalar editor ni ejecutar comandos en tu PC. Vercel compila React; Supabase administra Auth, datos y la función de sincronización; Apps Script envía la planilla.

## Estado real de la conexión

La conexión Vercel “Estado de pago” identifica la cuenta personal autorizada, pero devolvió HTTP 403 al consultar el alcance de sus proyectos. La lista de equipos llegó vacía. No había CLI Vercel disponible como alternativa autenticada. No se creó ni desplegó ningún proyecto Vercel desde esta sesión. No se utilizó la cuenta asociada a Delta Mining.

## A. Preparar la vista previa

1. Abrir la rama **develop/edp-v1** y su PR en GitHub. `main` contiene únicamente la inicialización hasta que se revise el PR; no fusionarlo para probar.
2. Entrar a Vercel con la cuenta que tiene acceso a `nahugarcia509-cmyk/Estados-de-pago`.
3. **Add New → Project → Import Git Repository**. Autorizar la app GitHub únicamente para este repositorio si Vercel lo solicita. No seleccionar Delta Mining OPS.
4. Framework: **Vite**. Root Directory: raíz del repositorio. Node.js: **24.x**. El archivo `vercel.json` define instalación, compilación y salida `dist`.
5. Si el importador ofrece un primer despliegue de `main`, **no publicarlo**: `main` todavía no contiene la aplicación. Crear la conexión y usar el PR/rama de desarrollo para una **Preview**. Mantener `main` como Production Branch. No establecer `develop/edp-v1` como rama de producción.
6. En el proyecto → **Deployments → Create Deployment** (o desplegar la rama desde la integración Git), elegir `develop/edp-v1` y entorno **Preview**. Verificar rama y commit antes de confirmar. Si el panel no permite crear la conexión sin despliegue inicial, completar este paso una vez que la cuenta conectada tenga permiso para que Codex cree explícitamente una Preview; no tomar un despliegue de producción como sustituto.
7. Sin variables de Supabase se puede compilar y abrir la pantalla de instalación/ingreso; no permite autenticarse ni muestra datos inventados.

La configuración Git deshabilita despliegues automáticos de `main`. [Referencia oficial](https://vercel.com/docs/project-configuration/git-configuration). Esto no bloquea una publicación manual: no usar **Promote to Production** ni un despliegue manual de producción sin autorización.

## B. Conectar Supabase

1. En Supabase, verificar proyecto y referencia `lygeqrjozogbjibgimym`, organización propietaria y uso de desarrollo. El acceso de esta sesión sigue denegado: no hay migración remota aplicada.
2. Desde GitHub, abrir `supabase/migrations/20261015233220_edp_core.sql` y copiar su contenido completo al **SQL Editor** del proyecto de desarrollo verificado. Revisar el esquema antes de ejecutar; no ejecutar dos veces ni usar otro proyecto como reemplazo. Si el destino ya tiene tablas EDP, requiere reconciliar migraciones antes.
3. Crear los usuarios mediante invitación en **Authentication → Users**. No configurar contraseñas comunes. Asignar empresas y membresías como indica `SETUP.md`, usando UUID reales de los usuarios invitados.
4. Obtener la URL real y una clave **publishable** en la configuración API del proyecto. Las claves secretas y `service_role` nunca van a Vercel frontend.
5. En Vercel → proyecto → **Settings → Environment Variables**, agregar **solo para Preview**:

   | Nombre                          | Valor                                                   |
   | ------------------------------- | ------------------------------------------------------- |
   | `VITE_SUPABASE_URL`             | URL API observada del proyecto de desarrollo verificado |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | Clave pública publishable de ese proyecto               |

6. Volver a desplegar la Preview después de guardar variables: Vite las incorpora durante la compilación. No cargar credenciales privadas ni una base de producción en previews.
7. En Supabase Auth, agregar la URL exacta de la Preview a las URLs autorizadas para invitaciones/recuperación. Evitar comodines amplios. Configurar correo de invitación/recuperación antes de probar esos flujos.
8. Abrir la Preview e ingresar con la cuenta invitada. Si aparece “sin membresías”, verificar la asignación en backend; la app no inventa permisos por email o metadata editable.

## C. Instalar el backend sin terminal

1. Abrir en GitHub `integrations/supabase-editor/sheets-ingest.ts` (archivo autocontenido generado desde el mismo código probado).
2. En Supabase de desarrollo → **Edge Functions**, crear una función `sheets-ingest` mediante el editor del dashboard y pegar el archivo completo. No pegar secretos en el código.
3. Configurar el secreto `EXPECTED_SUPABASE_REF` con la referencia del destino verificado. Supabase suministra URL/clave de servicio al runtime; comprobar configuración del proyecto.
4. Desactivar la comprobación JWT de plataforma **solo en esta función**, ya que Apps Script se autentica mediante HMAC por fuente. El código exige firma válida, timestamp reciente y fuente habilitada. La aplicación y su base mantienen Supabase Auth y RLS.
5. Desplegar únicamente en desarrollo, copiar la URL real de la función y continuar con `APPS_SCRIPT.md`.

No hace falta instalar Apps Script ni Node en tu PC: Apps Script se edita desde **Extensiones → Apps Script** de la Sheet.

## D. Revisar pruebas en GitHub

Abrir el PR → **Checks** o la pestaña **Actions**. El workflow valida tipos, reglas, RLS en PostgreSQL local, Apps Script simulado y compilación, sin claves ni cambios de base remota. Los resultados locales están en `TEST_RESULTS.md`; no equivalen a prueba de usuarios reales en Supabase.

Antes de habilitar uso real: probar dos contratistas y Vicuña desde sesiones independientes, importar una copia de la Sheet, confirmar conteos y revisar las reglas contractuales pendientes. No se considera finalizada esa validación remota todavía.
