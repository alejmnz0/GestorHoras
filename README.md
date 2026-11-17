# Gestor de Horas

Herramienta de escritorio **personal y 100 % local** para registrar e imputar las horas de trabajo dedicadas a cada proyecto. Incluye un **reloj flotante** que permanece sobre el escritorio y te recuerda periódicamente que imputes tu tiempo.

- Sin servidores, sin cuentas, sin Internet, sin Docker.
- Cada persona instala la aplicación en su ordenador y tiene sus propios datos.
- Los datos se guardan en `%APPDATA%\Gestor de Horas\gestor-horas.sqlite` y **no se borran al actualizar ni al desinstalar**.

---

## 1. Instalación (usuarios)

1. Ejecuta `GestorHoras-Setup-1.0.0.exe`.
2. Windows SmartScreen puede avisar de que el instalador no está firmado: pulsa **Más información → Ejecutar de todas formas**. (Para quitar el aviso habría que firmarlo con un certificado de firma de código de empresa).
3. Elige la carpeta de instalación (por defecto, la de tu usuario; no hacen falta permisos de administrador).
4. Se crean accesos directos en el **escritorio** y en el **menú Inicio**.

No hace falta instalar Node.js ni ninguna otra herramienta.

Para **compartirla con compañeros** basta con pasarles el `.exe`: cada instalación empieza vacía y pide el nombre la primera vez.

**Actualizar a una versión nueva:** ejecuta el nuevo instalador encima. Los datos se conservan.

---

## 2. Uso

### Primer arranque
La aplicación pide tu nombre. Se recuerda automáticamente; puedes cambiarlo o añadir otro usuario en **Configuración** o desde el selector de usuario de la pantalla de imputación.

### Imputar horas (pantalla principal)
| Campo | Detalle |
|---|---|
| Usuario | Recordado automáticamente. |
| Fecha | Hoy por defecto. Flechas ◀ ▶ para días anteriores/siguientes y botón **Hoy**. |
| Horas | Tramos de 0,25 h. Botones − / +, atajos (0,25 · 0,50 · 1 · 2 · 4) y **Resto** (rellena lo que queda de jornada). |
| Proyecto | Solo proyectos activos; se muestra el nombre. |
| Tipo de trabajo | Incidencia · Desarrollo · Mantenimiento (obligatorio). |
| Descripción | Opcional, máximo 500 caracteres. |

- **Ctrl + Enter** guarda.
- Tras guardar se conservan proyecto y tipo para imputar seguidas varias tareas parecidas.
- La tarjeta **Jornada del día** muestra imputadas, pendientes, % y barra de progreso; se pone en verde al completar la jornada.
- En la lista **Imputaciones del día** puedes editar (lápiz) o eliminar (papelera, con confirmación) cada registro.

### Reloj flotante y recordatorios
- Botón **«Minimizar a reloj flotante»**: oculta la ventana y deja un pequeño reloj siempre visible.
- El anillo del reloj muestra el progreso de la jornada de hoy (azul → verde al completarla).
- **Clic**: abre la ventana de imputación. **Arrastrar**: lo mueves (recuerda la posición). **Clic derecho**: posponer, pausar, reanudar, salir.
- Las zonas transparentes alrededor del reloj dejan pasar los clics a las ventanas de debajo.
- Al llegar un recordatorio el reloj **se agita**, **suena** un aviso discreto y muestra un **punto naranja** hasta que lo pulses.
- Los recordatorios funcionan con la ventana minimizada u oculta (se gestionan en el proceso principal).
- Por defecto, si la jornada de hoy ya está completa no se avisa (configurable).
- Al minimizar o cerrar la ventana principal la aplicación sigue en la **bandeja del sistema** (icono junto al reloj de Windows) y aparece el reloj flotante.

### Histórico
Tabla tipo hoja de cálculo con: Fecha · Usuario · Proyecto · Código proyecto · Tipo · Horas · Descripción.
- Ordenar pulsando en Fecha, Usuario, Proyecto u Horas.
- Buscar por proyecto y filtrar por usuario, proyecto, tipo y rango de fechas.
- Total de horas de los resultados filtrados.
- Editar y eliminar registros (con confirmación).
- **Exportar a Excel (.xlsx)** o **CSV** (separador `;` y coma decimal, se abre directamente en Excel en español). Se exporta lo que muestran los filtros.
- Paginación de 50 filas para mantener la fluidez con miles de registros.

### Proyectos
- Crear, editar, activar/desactivar y buscar.
- El código no puede repetirse (sin distinguir mayúsculas).
- Un proyecto con imputaciones **no se puede eliminar**: se desactiva y se conserva en el histórico.

### Configuración
Usuario, jornada máxima diaria (8,25 h por defecto), intervalo de recordatorios (15/30/45/60/90 min o personalizado), sonido y volumen, animación, posición del reloj, iniciar con Windows (arranca directamente como reloj flotante), mantener en bandeja, **copias de seguridad** y restaurar valores predeterminados.

### Copias de seguridad
- **Exportar copia**: guarda un fichero `.sqlite` con todos tus datos (úsalo para cambiar de ordenador).
- **Importar / restaurar**: sustituye los datos actuales por los de la copia. Antes se guarda automáticamente una copia de los datos actuales en `%APPDATA%\Gestor de Horas\copias-seguridad`.
- Además se crea **una copia automática al día** en esa carpeta (se conservan las 10 últimas).

**Cambio de ordenador:** en el equipo antiguo, *Exportar copia* → instala la app en el nuevo → *Importar / restaurar copia*.

---

## 3. Reglas de negocio implementadas

1. Mínimo 0,25 h (15 min) por imputación.
2. Siempre múltiplos de 15 minutos (se guardan como **minutos enteros**: sin errores decimales).
3. No se puede superar el máximo diario configurado (por usuario y día). El mensaje indica cuánto queda disponible.
4. Pendientes = jornada − imputadas.
5. Sin imputaciones negativas ni de cero.
6. Proyectos inactivos no seleccionables en nuevas imputaciones.
7. Proyectos con histórico no se eliminan físicamente.
8. Al editar se descuenta el valor anterior del propio registro. Si después se reduce la jornada, los registros existentes se pueden seguir editando sin aumentar horas.
9. Fechas guardadas como `YYYY-MM-DD`, mostradas como `DD/MM/YYYY`.
10. Cada registro está asociado a su usuario.
11. Escritura atómica a disco tras cada cambio (fichero temporal + renombrado, con reintentos), copia diaria y guardado al salir.
12. Se bloquea el doble guardado accidental de un registro idéntico en menos de 60 segundos.

Todas las reglas se validan en el proceso principal (fuente de verdad) y también en la interfaz para dar respuesta inmediata.

---

## 4. Desarrollo

### Requisitos
Node.js 20 o superior (solo para desarrollar, no para usar la app).

```bash
npm install          # instala dependencias
npm run dev          # arranca en modo desarrollo (F12 abre DevTools)
npm test             # pruebas unitarias e integración (Vitest)
npm run build        # compila interfaz + proceso principal
npm run dist         # genera el instalador en release/GestorHoras-Setup-x.y.z.exe
```

### Compilar una nueva versión
1. Sube la versión en `package.json` (`"version": "1.1.0"`).
2. `npm test`
3. `npm run dist` (en Windows funciona tal cual; en Linux/macOS hace falta Wine para incrustar el icono en el .exe).
4. Distribuye `release/GestorHoras-Setup-1.1.0.exe`. Instalar encima conserva los datos.

**Cambios en la base de datos:** añade una nueva entrada al final del array `MIGRATIONS` de `electron/db.ts` (nunca modifiques una existente). Se aplica sola al arrancar y también al importar copias antiguas.

### Pruebas end-to-end
`tests/e2e/run.mjs` arranca la aplicación Electron real y recorre: primer uso, proyectos, imputación, límites, edición, histórico, configuración, reloj flotante, **recordatorio real por temporizador con la ventana oculta**, arrastre y posición, restauración al hacer clic, bandeja y persistencia tras reiniciar.

```bash
npm run build
node tests/e2e/run.mjs                          # Windows / macOS
xvfb-run -a sh tests/e2e/xvfb-run.sh            # Linux sin pantalla (usa openbox)
```

### Arquitectura

```
electron/            Proceso principal (Node)
  main.ts            Ventanas, reloj flotante, bandeja, autoinicio, IPC
  preload.ts         Puente seguro (contextIsolation) → window.api
  db.ts              SQLite (sql.js), migraciones, escritura atómica
  repo.ts            Lógica de negocio y CRUD
  reminders.ts       Planificador de recordatorios (testeable, sin Electron)
  backup.ts          Copias manuales y automáticas
  exporter.ts        CSV y XLSX
  logger.ts          Log en %APPDATA%\Gestor de Horas\logs\app.log
shared/              Tipos, reglas y validaciones comunes a ambos lados
src/                 Interfaz React + Tailwind
  pages/             Imputar, Histórico, Proyectos, Configuración
  components/        Formulario, selector de horas, modales, avisos…
  floating.tsx       Ventana independiente del reloj flotante
tests/               Vitest (unitarias/integración) y e2e (Playwright + Electron)
build/               Iconos e instalador
```

**Decisiones técnicas**
- **sql.js (SQLite en WebAssembly)** en lugar de un módulo nativo: no hay que compilar nada para cada versión de Windows/Electron y el instalador funciona en cualquier equipo. La base de datos se carga en memoria y se vuelca a disco de forma atómica tras cada cambio; para el volumen de una herramienta personal es instantáneo.
- **Seguridad**: `contextIsolation` y `sandbox` activados, `nodeIntegration` desactivado, CSP estricta, navegación bloqueada y validación del origen de cada llamada IPC.
- **Recordatorios en el proceso principal** con revisión cada minuto como máximo, de modo que siguen funcionando con la interfaz oculta y se recuperan tras suspender el equipo.
- El sonido se genera con Web Audio (sin ficheros de audio) y respeta el volumen configurado.

### Registro de errores
`%APPDATA%\Gestor de Horas\logs\app.log` (rotación a 1 MB). Desde *Configuración → Abrir carpeta de datos* se accede directamente.
