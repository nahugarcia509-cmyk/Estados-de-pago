# Inspección de recursos — 15/10/2026

Se leyó íntegro el adjunto `Texto pegado(20261015-232424).txt` de la conversación referenciada. No se consultó ni modificó Delta Mining OPS.

- Repositorio autorizado: `nahugarcia509-cmyk/Estados-de-pago`, vacío al iniciar. Se inicializó `main` con README para permitir un PR; implementación en `develop/edp-v1`.
- Proyecto solicitado: `lygeqrjozogbjibgimym`. Ambas conexiones Supabase devolvieron denegación de permisos, incluso tras la reconexión informada. La conexión “Estado de pago” lista únicamente un proyecto diferente. No se usó ese proyecto y no se ejecutó SQL remoto.
- Fuente nativa accesible: [EDPs](https://docs.google.com/spreadsheets/d/1mmEM1q0PDkCipQ1bdAI5BO1DNwH3nf5ob6fmyT3MFUc/edit). Metadatos: `Registro de operadores` (2475 filas × 29 columnas), `WBS` (1000 × 27). Las dimensiones son límites de la grilla, no conteos de registros.
- No se encontró `EDPs.xlsx` en el espacio de trabajo ni en la búsqueda de Drive. Se inspeccionaron encabezados y cinco filas de cada hoja nativa, sin afirmar haber validado todo el archivo Excel.
- Zona horaria declarada en la fuente: America/Buenos_Aires, locale es_MX. Fechas operativas se interpretan explícitamente `DD/MM/YYYY` y se guardan como `date`; la aplicación emplea America/Argentina/San_Juan.

## Encabezados verificados

Registro: `Fecha`, `ID`, `Interno`, `Equipo`, `Operador`, `Supervisor Delta`, `Supervisor Vial Cliente`, `Turno de trabajo`, `N° Parte`, **`Proyecto `**, `Area de trabajo`, `Horómetro inicial`, `Horómetro final`, `Cant. Hs.`, `OD o FS`, `Combustible`, `Aceite`, `Tarea 1`, `Tarea 2`, `Información sobre Desgaste`, `Observaciones 1`, `Observaciones 2`, `Cambio de tareas planificadas`, **`Firma `**.

Los espacios finales de `Proyecto ` y `Firma ` están presentes. Mapeo literal en `shared/domain.ts`; no se aplica trim a los encabezados. El importador rechaza cambios de esquema y duplicados de encabezado.

WBS: `Equipo`, `tipo equipo`, `Centro de costo`, `Costo de hora`, `Costo de hora extra`, `Costo de movilizacion`, `Costo de desmovilizacion`, `Costo de OD`, `Costo FS`.

La muestra incluye Internos con sufijo `-JM` y una camioneta con diferencia 180 en medidor y en `Cant. Hs.`. Esto **no prueba su unidad contractual**: no se convierte en horas. Alias y unidades requieren confirmación humana. WBS referencia códigos base y centros de costo, pero no acredita que `Proyecto ` o `Area de trabajo` sean equivalentes a esos centros.

No se publica en este repositorio el contenido operativo de las filas, nombres de personas, firmas ni credenciales. Las pruebas usan fixtures sintéticos.
