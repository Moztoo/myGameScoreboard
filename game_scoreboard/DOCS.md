# Home Assistant Add-on: Game Scoreboard 🎮

Scoreboard nativo para torneos y partidas de videojuegos entre amigos. Diseñado específicamente para ejecutarse como Add-on de Home Assistant con soporte de **Home Assistant Ingress**, almacenamiento persistente en `/data`, y capacidad total de exportación/importación.

---

## 🌟 Características Principales

1. **Catálogo de Juegos y Reglas Personalizadas**:
   - Viene preconfigurado con **Mario Kart 8 Deluxe**, **Super Smash Bros. Ultimate**, **EA Sports FC / FIFA**, **Halo Infinite** y **Juegos de Mesa**.
   - Para **Mario Kart 8 Deluxe**, incluye los selectores de reglas oficiales (Clase/Modo: 150cc, 200cc, Carrera Espejo; Equipos; Objetos; Nivel CPU; Vehículos CPU; Pistas; Carreras: 4 a 48).
   - Permite agregar nuevos juegos y definir sus sistemas de puntuación (puntos altos, orden de llegada o puntos bajos).
2. **Roster de Jugadores con Fotos y Avatares**:
   - Da de alta a tus amigos con su nombre, apodo/gamertag y color distintivo.
   - Sube sus fotos directamente desde la interfaz móvil o PC (almacenadas localmente en `/data/avatars`).
3. **Gestor de Sesiones y Partidas en Vivo**:
   - Inicia una nueva sesión para la noche de juego.
   - Registra partidas individuales una a una con sus configuraciones.
   - **Partidas de Práctica**: Marca partidas como práctica con un clic para que no afecten los rankings globales competitivos.
4. **Dashboard y Leaderboard**:
   - Podio de campeones (1º, 2º, 3º).
   - Tabla general con partidas jugadas, victorias, tasa de victorias (Win Rate %), podios y puntos promedio.
   - Selector para filtrar por videojuego y toggle para incluir/excluir partidas de práctica.
5. **Portabilidad y Respaldo (Backup)**:
   - Exporta con 1 solo clic un archivo comprimido `.ZIP` con toda la base de datos y todas las fotos.
   - Restaura el respaldo en cualquier momento o muévelo a otra instancia de Home Assistant.

---

## 🚀 Instalación en Home Assistant

### Método 1: Repositorio Local (Vía Samba o SSH)
1. Copia la carpeta `game_scoreboard` dentro del directorio `/addons/local/` de tu servidor Home Assistant:
   ```bash
   scp -r game_scoreboard ricardom@192.168.1.20:/addons/local/
   ```
2. En Home Assistant, dirígete a **Ajustes** -> **Complementos (Add-ons)** -> **Tienda de complementos**.
3. Haz clic en los tres puntos de la esquina superior derecha y selecciona **Comprobar si hay actualizaciones** o **Recargar**.
4. Verás aparecer **Game Scoreboard** bajo la categoría *Local Add-ons*.
5. Haz clic en **Instalar**.
6. Activa las opciones:
   - ✅ **Iniciar en el arranque**
   - ✅ **Mostrar en la barra lateral** (Ingress nativo)
7. Haz clic en **Iniciar** y luego pulsa en **Abrir interfaz web** o búscalo directamente en el menú lateral izquierdo de Home Assistant.

### Método 2: Repositorio Git
1. Sube este repositorio a tu cuenta de GitHub (ej. `https://github.com/ricardom/myGameScoreboard`).
2. En Home Assistant -> **Ajustes** -> **Complementos** -> **Tienda de complementos** -> Tres puntos -> **Repositorios**.
3. Añade la URL del repositorio Git.
4. Instala el Add-on directamente desde la tienda.

---

## 💾 Persistencia de Datos
- La base de datos SQLite se almacena de forma segura y persistente en `/data/scoreboard.db`.
- Los avatares se almacenan en `/data/avatars/`.
- Actualizar o reiniciar el Add-on **no borra** la información.
