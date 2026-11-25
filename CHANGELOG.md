# Registro de Cambios (Changelog) - Game Scoreboard

Todos los cambios importantes de este Add-on para Home Assistant se documentan en este archivo.

## [1.1.1] - 2026-11-24
### ✨ Novedades
- **Iconos Oficiales de Mario Kart 8 Deluxe:**
  - Descarga e integración local de los **48 iconos de personajes** oficiales, **24 emblemas de copas** y **104 iconos de pistas** (96 circuitos de carrera + 8 escenarios de batalla).
  - Selector visual de personajes con su icono oficial al configurar o capturar una partida.
  - Botones de Copas y Pistas en el **Modo Captura** ilustrados con sus emblemas y miniaturas oficiales de pista.
  - Visualización de iconos de personajes, copas y pistas en el **Dashboard** (Personaje Más Ganador, Dominio por Pista y Copa) y en el **Historial de Sesiones**.
- **Changelog Visible en Home Assistant y en la Web:**
  - Archivo `CHANGELOG.md` integrado nativamente con el panel del Supervisor de Home Assistant.
  - Nuevo visor de **Novedades / Changelog** dentro de la interfaz web al hacer clic en la insignia de versión (`v1.1.1`) en la barra superior.

---

## [1.1.0] - 2026-11-24
### 🚀 Cambios Mayores
- **Parámetros Dinámicos por Tipo de Partida:**
  - Los selectores de reglas cambian automáticamente según el tipo de partida elegido (`Copa Grand Prix (4 Carreras)`, `Torneo / Copa Completa`, `Carrera Individual`, `Batalla de Globos`, `Patrulla Piraña`, `Batalla de Monedas`).
- **Modo Captura Rápida (Carrera por Carrera):**
  - Nuevo flujo interactivo tras definir la partida para capturar cada carrera en tiempo real.
  - Pre-asignación automática de las 4 pistas cuando se juega una **Copa Definida / Grand Prix** o secuencia automática cuando se juega **En orden**.
  - Selector rápido con buscador y botón `🎲 Al Azar` para partidas con pistas aleatorias.
  - Botonera táctil de acceso rápido (`1º` al `12º`) por jugador con cálculo automático de puntos (`15, 12, 10, 9... 1`) y marcador acumulado en vivo.
- **Pantalla de Fin de Partida y Burndown:**
  - Resumen al terminar la partida con podio, **Gráfica de Burndown de la Copa** (evolución carrera a carrera) y botones directos para **Crear Nueva Partida** o **Cerrar / Finalizar Sesión**.
- **Estadísticas por Pista y por Clase:**
  - Almacenamiento individual de cada carrera en base de datos (`match_races` y `match_race_scores`).
  - Nueva sección en el Dashboard con **Desempeño por Clase (`150cc`, `200cc`, `Carrera espejo`)** y **Dominio por Pista y Copa** (Rey de la Pista y filtro por jugador).

---

## [1.0.14] - 2026-11-23 (Primera Versión Estable)
### ✨ Novedades
- **Control de Carreras Disputadas 🏁:**
  - Conteo de carreras por jugador, por sesión, acumuladas en el mes y totales históricas.
  - Nuevas columnas de carreras en el Leaderboard del Dashboard, en el detalle de sesión y en los reportes por correo (sesión y mensual).

---

## [1.0.13] - 2026-11-23
### ✨ Novedades
- **Resumen Mensual de Mario Kart y Gráficas vs Tiempo:**
  - Nueva plantilla de correo mensual con gráfica de evolución temporal incrustada.
  - Gráfica interactiva Chart.js en el Dashboard (modo acumulativo y por partida) y tarjetas de Récord en una Partida, Personaje Más Ganador y Mejor Win Rate.

---

## [1.0.11 - 1.0.12] - 2026-11-23
### 🎨 Mejoras Visuales
- Banner personalizado de Mario Kart 8 optimizado para clientes de correo de alta densidad (Retina/High-DPI).
- Rediseño visual de las tarjetas de historial de partidas en los correos con chips de reglas y tablas estilizadas.

---

## [1.0.0 - 1.0.10] - 2026-11-22
### 🎉 Lanzamiento Inicial
- Scoreboard multi-juego nativo para Home Assistant con soporte de Ingress.
- Gestión de perfiles de jugadores con avatares, colores y correo electrónico.
- Configuración SMTP, consola de depuración, logs de envíos, automatizaciones programables y respaldos completos en ZIP.
