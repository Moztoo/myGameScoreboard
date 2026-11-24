import os
import sqlite3
import json
import yaml
import re
from typing import Any
from pathlib import Path

# Paths configuration
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("DATA_DIR", BASE_DIR.parent / "data"))
DB_PATH = DATA_DIR / "scoreboard.db"
AVATARS_DIR = DATA_DIR / "avatars"
DEFAULT_GAMES_PATH = BASE_DIR / "default_games.yaml"


def get_match_race_count(rule_values: Any, match_type: str = "", recorded_races_count: int = 0) -> int:
    """Extract the number of races played in a match from recorded races, rules, or match type."""
    if recorded_races_count and recorded_races_count > 0:
        return int(recorded_races_count)

    if isinstance(rule_values, str):
        try:
            rule_values = json.loads(rule_values)
        except Exception:
            rule_values = {}
    elif not isinstance(rule_values, dict):
        rule_values = {}

    mt_lower = (match_type or "").lower()
    if "individual" in mt_lower:
        return 1
    if "grand prix" in mt_lower or str(rule_values.get("pistas", "")).lower() == "copa definida":
        return 4

    carreras_val = rule_values.get("carreras") or rule_values.get("rondas_batalla") or rule_values.get("races")
    if carreras_val:
        m = re.search(r'\d+', str(carreras_val))
        if m:
            return int(m.group(0))

    for k, v in rule_values.items():
        if "carrera" in str(k).lower() or "ronda" in str(k).lower():
            m = re.search(r'\d+', str(v))
            if m:
                return int(m.group(0))

    return 1


def ensure_directories():
    """Ensure data and avatar directories exist."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    AVATARS_DIR.mkdir(parents=True, exist_ok=True)


def get_db_connection() -> sqlite3.Connection:
    """Get a SQLite connection with row_factory and WAL mode."""
    ensure_directories()
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


def init_db():
    """Initialize database tables and seed initial games if empty."""
    ensure_directories()
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.executescript("""
    CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT '🎮',
        description TEXT,
        scoring_type TEXT NOT NULL DEFAULT 'points_high',
        default_points_system_json TEXT,
        match_types_json TEXT,
        rule_settings_json TEXT,
        player_metrics_json TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        nickname TEXT,
        email TEXT,
        avatar_url TEXT,
        color_hex TEXT DEFAULT '#3b82f6',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        title TEXT NOT NULL,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP,
        status TEXT NOT NULL DEFAULT 'active',
        notes TEXT,
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS session_players (
        session_id INTEGER NOT NULL,
        player_id INTEGER NOT NULL,
        PRIMARY KEY (session_id, player_id),
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        match_number INTEGER NOT NULL,
        match_type TEXT NOT NULL,
        rule_values_json TEXT DEFAULT '{}',
        is_practice INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS match_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id INTEGER NOT NULL,
        player_id INTEGER NOT NULL,
        score REAL NOT NULL DEFAULT 0.0,
        rank_position INTEGER NOT NULL DEFAULT 1,
        metrics_json TEXT DEFAULT '{}',
        FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
        FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_matches_session ON matches(session_id);
    CREATE INDEX IF NOT EXISTS idx_matches_practice ON matches(is_practice);
    CREATE INDEX IF NOT EXISTS idx_match_scores_match ON match_scores(match_id);
    CREATE INDEX IF NOT EXISTS idx_match_scores_player ON match_scores(player_id);

    CREATE TABLE IF NOT EXISTS match_races (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id INTEGER NOT NULL,
        race_number INTEGER NOT NULL,
        cup_name TEXT,
        track_name TEXT NOT NULL,
        class_mode TEXT,
        played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS match_race_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        race_id INTEGER NOT NULL,
        match_id INTEGER NOT NULL,
        player_id INTEGER NOT NULL,
        position INTEGER NOT NULL,
        points REAL NOT NULL DEFAULT 0.0,
        FOREIGN KEY (race_id) REFERENCES match_races(id) ON DELETE CASCADE,
        FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
        FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_match_races_match ON match_races(match_id);
    CREATE INDEX IF NOT EXISTS idx_match_races_track ON match_races(track_name);
    CREATE INDEX IF NOT EXISTS idx_match_race_scores_race ON match_race_scores(race_id);
    CREATE INDEX IF NOT EXISTS idx_match_race_scores_match ON match_race_scores(match_id);
    CREATE INDEX IF NOT EXISTS idx_match_race_scores_player ON match_race_scores(player_id);

    CREATE TABLE IF NOT EXISTS email_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipient TEXT NOT NULL,
        subject TEXT NOT NULL,
        trigger_type TEXT NOT NULL DEFAULT 'test',
        status TEXT NOT NULL,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS email_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        subject_template TEXT NOT NULL,
        banner_url TEXT,
        intro_text TEXT,
        include_podium INTEGER NOT NULL DEFAULT 1,
        include_standings INTEGER NOT NULL DEFAULT 1,
        include_matches INTEGER NOT NULL DEFAULT 1,
        include_metrics INTEGER NOT NULL DEFAULT 1,
        footer_text TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS automations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        content_type TEXT NOT NULL,
        template_id TEXT NOT NULL,
        target_recipients TEXT NOT NULL DEFAULT 'session_participants',
        custom_emails TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_triggered_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_email_logs_created ON email_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_automations_active ON automations(is_active);
    """)
    conn.commit()

    # Seed default games if table is empty, or upgrade rule_settings for dynamic match types
    cursor.execute("SELECT COUNT(*) AS cnt FROM games")
    count = cursor.fetchone()["cnt"]
    if DEFAULT_GAMES_PATH.exists():
        with open(DEFAULT_GAMES_PATH, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
            games_list = data.get("games", [])
            if count == 0:
                for g in games_list:
                    cursor.execute("""
                    INSERT INTO games (
                        id, name, icon, description, scoring_type,
                        default_points_system_json, match_types_json,
                        rule_settings_json, player_metrics_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        g["id"],
                        g["name"],
                        g.get("icon", "🎮"),
                        g.get("description", ""),
                        g.get("scoring_type", "points_high"),
                        json.dumps(g.get("default_points_system", [])),
                        json.dumps(g.get("match_types", [])),
                        json.dumps(g.get("rule_settings", [])),
                        json.dumps(g.get("player_metrics", []))
                    ))
                conn.commit()
            else:
                for g in games_list:
                    cursor.execute("SELECT rule_settings_json FROM games WHERE id = ?", (g["id"],))
                    row = cursor.fetchone()
                    if row:
                        try:
                            existing_rules = json.loads(row["rule_settings_json"] or "[]")
                            has_dynamic = any("match_types" in r for r in existing_rules if isinstance(r, dict))
                            if not has_dynamic:
                                cursor.execute("""
                                UPDATE games SET match_types_json = ?, rule_settings_json = ?
                                WHERE id = ?
                                """, (
                                    json.dumps(g.get("match_types", [])),
                                    json.dumps(g.get("rule_settings", [])),
                                    g["id"]
                                ))
                        except Exception:
                            pass
                conn.commit()

    # Migration: Ensure email column exists in players table
    try:
        cursor.execute("ALTER TABLE players ADD COLUMN email TEXT")
        conn.commit()
    except Exception:
        pass

    # Auto-fix rank positions for any existing Mario Kart matches (highest score = 1st rank)
    try:
        cursor.execute("""
        SELECT DISTINCT m.id 
        FROM matches m
        JOIN sessions s ON m.session_id = s.id
        JOIN games g ON s.game_id = g.id
        WHERE g.id LIKE '%mario_kart%' OR g.name LIKE '%mario kart%'
        """)
        mk_matches = [row["id"] for row in cursor.fetchall()]
        for m_id in mk_matches:
            cursor.execute("SELECT id, score FROM match_scores WHERE match_id = ? ORDER BY score DESC, id ASC", (m_id,))
            scores_to_fix = cursor.fetchall()
            for r_idx, sc_row in enumerate(scores_to_fix, start=1):
                cursor.execute("UPDATE match_scores SET rank_position = ? WHERE id = ?", (r_idx, sc_row["id"]))
        conn.commit()
    except Exception:
        pass

    # Seed default templates if empty
    try:
        cursor.execute("SELECT COUNT(*) AS cnt FROM email_templates")
        if cursor.fetchone()["cnt"] == 0:
            cursor.execute("""
            INSERT INTO email_templates (
                id, name, subject_template, banner_url, intro_text,
                include_podium, include_standings, include_matches, include_metrics, footer_text
            ) VALUES
            ('session_mario_kart', 'Reporte Mario Kart 8 Deluxe', '🏎️ Resultados Mario Kart 8: {{session_title}} 🏁', 'static/img/banner_mario_kart.jpg', '¡Aquí están los resultados oficiales de la noche de Mario Kart 8!', 1, 1, 1, 1, 'Game Scoreboard · Torneo de Amigos'),
            ('session_generic', 'Reporte de Sesión General', '🏆 Resultados de Sesión: {{session_title}}', 'static/img/email_banner.jpg', 'Resumen general de las partidas y puntuaciones de la sesión.', 1, 1, 1, 1, 'Game Scoreboard · Home Assistant'),
            ('monthly_mario_kart', 'Resumen Mensual Mario Kart 8', '📅 Resumen Mensual Mario Kart 8: {{month}} - Estadísticas y Gráficas 🏁', 'static/img/banner_mario_kart.jpg', 'Resumen oficial del mes en Mario Kart 8 Deluxe: podio, evolución de puntos vs tiempo, récords y meta de personajes.', 1, 1, 1, 1, 'Game Scoreboard · Mario Kart Monthly Championship'),
            ('monthly_digest', 'Resumen Mensual de Campeonatos', '📅 Resumen Mensual: {{month}} - Estadísticas y Récords', 'static/img/email_banner.jpg', 'Aquí está el resumen del mes con las estadísticas acumuladas y el podio general.', 1, 1, 0, 0, 'Game Scoreboard · Resumen Mensual Automático'),
            ('global_leaderboard', 'Tabla de Posiciones Global', '🏅 Leaderboard Global Actualizado - Game Scoreboard', 'static/img/email_banner.jpg', 'Estado actual del campeonato y tabla de posiciones de todos los jugadores.', 1, 1, 0, 0, 'Game Scoreboard · Home Assistant')
            """)
            conn.commit()
        else:
            # Upgrade Mario Kart banner if still pointing to generic default
            cursor.execute("""
                UPDATE email_templates 
                SET banner_url = 'static/img/banner_mario_kart.jpg' 
                WHERE id = 'session_mario_kart' AND (banner_url IS NULL OR banner_url = 'static/img/email_banner.jpg')
            """)
            # Ensure monthly_mario_kart template exists
            cursor.execute("SELECT id FROM email_templates WHERE id = 'monthly_mario_kart'")
            if not cursor.fetchone():
                cursor.execute("""
                INSERT INTO email_templates (
                    id, name, subject_template, banner_url, intro_text,
                    include_podium, include_standings, include_matches, include_metrics, footer_text
                ) VALUES
                ('monthly_mario_kart', 'Resumen Mensual Mario Kart 8', '📅 Resumen Mensual Mario Kart 8: {{month}} - Estadísticas y Gráficas 🏁', 'static/img/banner_mario_kart.jpg', 'Resumen oficial del mes en Mario Kart 8 Deluxe: podio, evolución de puntos vs tiempo, récords y meta de personajes.', 1, 1, 1, 1, 'Game Scoreboard · Mario Kart Monthly Championship')
                """)
            conn.commit()

        cursor.execute("SELECT COUNT(*) AS cnt FROM automations")
        if cursor.fetchone()["cnt"] == 0:
            cursor.execute("""
            INSERT INTO automations (
                name, trigger_type, content_type, template_id, target_recipients, is_active
            ) VALUES
            ('Reporte al Finalizar Sesión', 'session_finished', 'session_summary', 'session_mario_kart', 'session_participants', 1)
            """)
            conn.commit()
    except Exception:
        pass

    conn.close()
