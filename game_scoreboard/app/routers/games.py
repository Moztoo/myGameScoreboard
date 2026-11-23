from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
import json
from database import get_db_connection
from models import GameBase, GameCreate, GameUpdate

router = APIRouter(prefix="/api/games", tags=["games"])


def row_to_game(row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "icon": row["icon"],
        "description": row["description"],
        "scoring_type": row["scoring_type"],
        "default_points_system": json.loads(row["default_points_system_json"] or "[]"),
        "match_types": json.loads(row["match_types_json"] or "[]"),
        "rule_settings": json.loads(row["rule_settings_json"] or "[]"),
        "player_metrics": json.loads(row["player_metrics_json"] or "[]"),
        "is_active": bool(row["is_active"]),
        "created_at": str(row["created_at"])
    }


@router.get("", response_model=List[Dict[str, Any]])
def list_games(active_only: bool = True):
    conn = get_db_connection()
    cursor = conn.cursor()
    if active_only:
        cursor.execute("SELECT * FROM games WHERE is_active = 1 ORDER BY name ASC")
    else:
        cursor.execute("SELECT * FROM games ORDER BY name ASC")
    rows = cursor.fetchall()
    conn.close()
    return [row_to_game(r) for r in rows]


@router.get("/{game_id}", response_model=Dict[str, Any])
def get_game(game_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM games WHERE id = ?", (game_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Juego no encontrado")
    return row_to_game(row)


@router.post("", response_model=Dict[str, Any])
def create_game(game: GameCreate):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM games WHERE id = ?", (game.id,))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="El ID del juego ya existe")

    cursor.execute("""
    INSERT INTO games (
        id, name, icon, description, scoring_type,
        default_points_system_json, match_types_json,
        rule_settings_json, player_metrics_json, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        game.id,
        game.name,
        game.icon,
        game.description or "",
        game.scoring_type,
        json.dumps(game.default_points_system),
        json.dumps(game.match_types),
        json.dumps(game.rule_settings),
        json.dumps(game.player_metrics),
        1 if game.is_active else 0
    ))
    conn.commit()
    conn.close()
    return get_game(game.id)


@router.put("/{game_id}", response_model=Dict[str, Any])
def update_game(game_id: str, game: GameUpdate):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM games WHERE id = ?", (game_id,))
    existing = cursor.fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Juego no encontrado")

    name = game.name if game.name is not None else existing["name"]
    icon = game.icon if game.icon is not None else existing["icon"]
    description = game.description if game.description is not None else existing["description"]
    scoring_type = game.scoring_type if game.scoring_type is not None else existing["scoring_type"]
    
    pts = json.dumps(game.default_points_system) if game.default_points_system is not None else existing["default_points_system_json"]
    m_types = json.dumps(game.match_types) if game.match_types is not None else existing["match_types_json"]
    r_settings = json.dumps(game.rule_settings) if game.rule_settings is not None else existing["rule_settings_json"]
    p_metrics = json.dumps(game.player_metrics) if game.player_metrics is not None else existing["player_metrics_json"]
    is_active = (1 if game.is_active else 0) if game.is_active is not None else existing["is_active"]

    cursor.execute("""
    UPDATE games SET
        name = ?, icon = ?, description = ?, scoring_type = ?,
        default_points_system_json = ?, match_types_json = ?,
        rule_settings_json = ?, player_metrics_json = ?, is_active = ?
    WHERE id = ?
    """, (name, icon, description, scoring_type, pts, m_types, r_settings, p_metrics, is_active, game_id))
    conn.commit()
    conn.close()
    return get_game(game_id)


@router.delete("/{game_id}")
def delete_game(game_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM games WHERE id = ?", (game_id,))
    conn.commit()
    conn.close()
    return {"status": "ok", "message": f"Juego {game_id} eliminado"}
