# Game Scoreboard - Home Assistant Add-on 🎮

Un Add-on nativo para **Home Assistant** que te permite llevar el scoreboard, historial y estadísticas de diferentes videojuegos (Mario Kart 8 Deluxe, Super Smash Bros, FIFA, Halo, etc.) que juegas con tus amigos.

Soporta registro de jugadores con fotos, configuración dinámica de reglas por juego, sesiones en vivo con registro de partidas, partidas marcadas como práctica (que no contaminan el ranking global), y exportación/importación portátil de datos en `.zip`.

![HA Ingress Ready](https://img.shields.io/badge/Home%20Assistant-Ingress%20Ready-blue.svg)
![Architecture](https://img.shields.io/badge/Architecture-FastAPI%20%2B%20SQLite-green.svg)
![Multi-Arch](https://img.shields.io/badge/Arch-aarch64%20%7C%20amd64-orange.svg)

---

## 📸 Vista General y Capacidades

- **Reglas oficiales para Mario Kart 8**: Preconfigurado con los campos de selección de copa (Clase: 150cc, 200cc, Espejo; Equipos; Objetos; Nivel CPU; Vehículos CPU; Pistas; Número de Carreras: 4 a 48).
- **Roster con Fotos**: Sube fotos de tus amigos, asígnales un Gamertag y un color distintivo.
- **Partidas de Práctica**: Alterna fácilmente si una partida es amistosa/práctica para que quede registrada en la sesión pero se excluya de los rankings competitivos globales.
- **HA Ingress Nativo**: Se integra dentro de la interfaz de Home Assistant sin pedir claves adicionales ni abrir puertos en tu router.
- **100% Portátil**: Exporta e importa con 1 solo clic un `.zip` con la base de datos completa y los avatares para migrar entre servidores.

---

## 🛠️ Estructura del Repositorio

```text
├── repository.yaml             # Manifiesto de repositorio para HA Add-on Store
├── game_scoreboard/            # Directorio del Add-on
│   ├── config.yaml             # Configuración del Add-on (Ingress, arquitectura, permisos)
│   ├── Dockerfile              # Contenedor Alpine multi-arch optimizado
│   ├── build.yaml              # Imágenes base soportadas (aarch64, amd64, etc.)
│   ├── run.sh                  # Script de inicio
│   ├── DOCS.md                 # Documentación completa para Home Assistant
│   ├── icon.png / logo.png     # Gráficos del Add-on
│   └── app/
│       ├── main.py             # FastAPI con middleware de Ingress
│       ├── database.py         # Conexión SQLite con modo WAL y tablas
│       ├── default_games.yaml  # Configuración inicial de juegos (Mario Kart 8, etc.)
│       ├── models.py           # Modelos de datos Pydantic
│       ├── routers/            # Endpoints REST para juegos, jugadores, sesiones, stats y backups
│       └── static/             # Single Page Application (HTML5, Tailwind, CSS, JS reactivo)
```

---

## 🧪 Pruebas Automatizadas

Para ejecutar la suite de pruebas automatizadas:
```bash
pytest game_scoreboard/tests/test_scoreboard.py -v
```
Todas las pruebas de inicialización de esquemas, registro de partidas con reglas dinámicas, exclusión de prácticas y exportación/importación `.zip` están verificadas.
