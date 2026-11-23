import os
import sqlite3
import json
import yaml
from pathlib import Path

# Paths configuration
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("DATA_DIR", BASE_DIR.parent / "data"))
DB_PATH = DATA_DIR / "scoreboard.db"
AVATARS_DIR = DATA_DIR / "avatars"
DEFAULT_GAMES_PATH = BASE_DIR / "default_games.yaml"


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
    """)
    conn.commit()

    # Seed default games if table is empty
    cursor.execute("SELECT COUNT(*) AS cnt FROM games")
    count = cursor.fetchone()["cnt"]
    if count == 0 and DEFAULT_GAMES_PATH.exists():
        with open(DEFAULT_GAMES_PATH, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
            games_list = data.get("games", [])
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

    conn.close()
