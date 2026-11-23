import os
import shutil
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File
from typing import List, Dict, Any, Optional
from database import get_db_connection, AVATARS_DIR
from models import PlayerCreate, PlayerUpdate, PlayerResponse

router = APIRouter(prefix="/api/players", tags=["players"])


@router.get("", response_model=List[Dict[str, Any]])
def list_players():
    conn = get_db_connection()
    cursor = conn.cursor()
    # Compute basic stats per player (excluding practice matches)
    cursor.execute("""
    SELECT 
        p.id, p.name, p.nickname, p.avatar_url, p.color_hex, p.created_at,
        COUNT(DISTINCT ms.id) AS total_matches,
        SUM(CASE WHEN ms.rank_position = 1 THEN 1 ELSE 0 END) AS wins
    FROM players p
    LEFT JOIN match_scores ms ON p.id = ms.player_id
    LEFT JOIN matches m ON ms.match_id = m.id AND m.is_practice = 0
    GROUP BY p.id
    ORDER BY wins DESC, total_matches DESC, p.name ASC
    """)
    rows = cursor.fetchall()
    conn.close()

    result = []
    for r in rows:
        total = r["total_matches"] or 0
        wins = r["wins"] or 0
        rate = round((wins / total * 100), 1) if total > 0 else 0.0
        result.append({
            "id": r["id"],
            "name": r["name"],
            "nickname": r["nickname"] or "",
            "avatar_url": r["avatar_url"],
            "color_hex": r["color_hex"] or "#3b82f6",
            "created_at": str(r["created_at"]),
            "total_matches": total,
            "wins": wins,
            "win_rate": rate
        })
    return result


@router.get("/{player_id}", response_model=Dict[str, Any])
def get_player(player_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM players WHERE id = ?", (player_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Jugador no encontrado")

    # Get match history and per-game performance (excluding practice for competitive stats)
    cursor.execute("""
    SELECT 
        g.id AS game_id, g.name AS game_name, g.icon AS game_icon,
        COUNT(ms.id) AS matches_played,
        SUM(CASE WHEN ms.rank_position = 1 THEN 1 ELSE 0 END) AS wins,
        AVG(ms.score) AS avg_score
    FROM match_scores ms
    JOIN matches m ON ms.match_id = m.id AND m.is_practice = 0
    JOIN sessions s ON m.session_id = s.id
    JOIN games g ON s.game_id = g.id
    WHERE ms.player_id = ?
    GROUP BY g.id
    ORDER BY matches_played DESC
    """, (player_id,))
    games_stats = cursor.fetchall()
    conn.close()

    return {
        "id": row["id"],
        "name": row["name"],
        "nickname": row["nickname"] or "",
        "avatar_url": row["avatar_url"],
        "color_hex": row["color_hex"] or "#3b82f6",
        "created_at": str(row["created_at"]),
        "games_stats": [
            {
                "game_id": gs["game_id"],
                "game_name": gs["game_name"],
                "game_icon": gs["game_icon"],
                "matches_played": gs["matches_played"],
                "wins": gs["wins"] or 0,
                "win_rate": round(((gs["wins"] or 0) / gs["matches_played"] * 100), 1) if gs["matches_played"] > 0 else 0.0,
                "avg_score": round(gs["avg_score"] or 0, 1)
            }
            for gs in games_stats
        ]
    }


@router.post("", response_model=Dict[str, Any])
def create_player(player: PlayerCreate):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO players (name, nickname, color_hex)
    VALUES (?, ?, ?)
    """, (player.name, player.nickname or "", player.color_hex or "#3b82f6"))
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return get_player(new_id)


@router.put("/{player_id}", response_model=Dict[str, Any])
def update_player(player_id: int, player: PlayerUpdate):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM players WHERE id = ?", (player_id,))
    existing = cursor.fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Jugador no encontrado")

    name = player.name if player.name is not None else existing["name"]
    nickname = player.nickname if player.nickname is not None else existing["nickname"]
    color_hex = player.color_hex if player.color_hex is not None else existing["color_hex"]

    cursor.execute("""
    UPDATE players SET name = ?, nickname = ?, color_hex = ?
    WHERE id = ?
    """, (name, nickname, color_hex, player_id))
    conn.commit()
    conn.close()
    return get_player(player_id)


@router.post("/{player_id}/avatar")
async def upload_avatar(player_id: int, file: UploadFile = File(...)):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM players WHERE id = ?", (player_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Jugador no encontrado")

    # Validate file extension
    ext = Path(file.filename or "").suffix.lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
        ext = ".jpg"

    AVATARS_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"player_{player_id}{ext}"
    dest_path = AVATARS_DIR / filename

    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    avatar_url = f"avatars/{filename}"
    cursor.execute("UPDATE players SET avatar_url = ? WHERE id = ?", (avatar_url, player_id))
    conn.commit()
    conn.close()

    return {"status": "ok", "avatar_url": avatar_url}


@router.delete("/{player_id}")
def delete_player(player_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM players WHERE id = ?", (player_id,))
    conn.commit()
    conn.close()
    return {"status": "ok", "message": f"Jugador {player_id} eliminado"}
