from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any, Optional
from database import get_db_connection

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("/overview")
def get_overview():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) AS cnt FROM games WHERE is_active = 1")
    total_games = cursor.fetchone()["cnt"]

    cursor.execute("SELECT COUNT(*) AS cnt FROM players")
    total_players = cursor.fetchone()["cnt"]

    cursor.execute("SELECT COUNT(*) AS cnt FROM sessions WHERE status = 'active'")
    active_sessions = cursor.fetchone()["cnt"]

    cursor.execute("SELECT COUNT(*) AS cnt FROM matches")
    total_matches = cursor.fetchone()["cnt"]

    cursor.execute("SELECT COUNT(*) AS cnt FROM matches WHERE is_practice = 0")
    competitive_matches = cursor.fetchone()["cnt"]

    # Most played game
    cursor.execute("""
    SELECT g.name, COUNT(m.id) AS match_count
    FROM matches m
    JOIN sessions s ON m.session_id = s.id
    JOIN games g ON s.game_id = g.id
    GROUP BY g.id
    ORDER BY match_count DESC
    LIMIT 1
    """)
    top_game_row = cursor.fetchone()
    top_game = top_game_row["name"] if top_game_row else "Ninguno"

    conn.close()
    return {
        "total_games": total_games,
        "total_players": total_players,
        "active_sessions": active_sessions,
        "total_matches": total_matches,
        "competitive_matches": competitive_matches,
        "practice_matches": total_matches - competitive_matches,
        "top_game": top_game
    }


@router.get("/leaderboard")
def get_leaderboard(game_id: Optional[str] = None, include_practice: bool = False):
    conn = get_db_connection()
    cursor = conn.cursor()

    query = """
    SELECT 
        p.id AS player_id,
        p.name,
        p.nickname,
        p.avatar_url,
        p.color_hex,
        COUNT(ms.id) AS matches_played,
        SUM(CASE WHEN ms.rank_position = 1 THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN ms.rank_position <= 3 THEN 1 ELSE 0 END) AS podiums,
        SUM(ms.score) AS total_score,
        AVG(ms.score) AS avg_score
    FROM players p
    JOIN match_scores ms ON p.id = ms.player_id
    JOIN matches m ON ms.match_id = m.id
    JOIN sessions s ON m.session_id = s.id
    WHERE 1=1
    """
    params = []
    if not include_practice:
        query += " AND m.is_practice = 0"
    if game_id:
        query += " AND s.game_id = ?"
        params.append(game_id)

    query += """
    GROUP BY p.id
    ORDER BY wins DESC, total_score DESC, matches_played DESC
    """
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    result = []
    for rank, r in enumerate(rows, start=1):
        played = r["matches_played"] or 0
        wins = r["wins"] or 0
        win_rate = round((wins / played * 100), 1) if played > 0 else 0.0
        result.append({
            "rank": rank,
            "player_id": r["player_id"],
            "name": r["name"],
            "nickname": r["nickname"] or "",
            "avatar_url": r["avatar_url"],
            "color_hex": r["color_hex"] or "#3b82f6",
            "matches_played": played,
            "wins": wins,
            "podiums": r["podiums"] or 0,
            "win_rate": win_rate,
            "total_score": round(r["total_score"] or 0.0, 1),
            "avg_score": round(r["avg_score"] or 0.0, 1)
        })

    return result


@router.get("/recent_matches")
def get_recent_matches(limit: int = 10):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
    SELECT 
        m.id, m.match_number, m.match_type, m.is_practice, m.played_at,
        s.id AS session_id, s.title AS session_title,
        g.name AS game_name, g.icon AS game_icon
    FROM matches m
    JOIN sessions s ON m.session_id = s.id
    JOIN games g ON s.game_id = g.id
    ORDER BY m.played_at DESC, m.id DESC
    LIMIT ?
    """, (limit,))
    matches = cursor.fetchall()

    result = []
    for m in matches:
        match_id = m["id"]
        cursor.execute("""
        SELECT ms.score, ms.rank_position, p.name, p.nickname, p.avatar_url, p.color_hex
        FROM match_scores ms
        JOIN players p ON ms.player_id = p.id
        WHERE ms.match_id = ?
        ORDER BY ms.rank_position ASC, ms.score DESC
        """, (match_id,))
        scores = [dict(s) for s in cursor.fetchall()]

        result.append({
            "id": m["id"],
            "session_id": m["session_id"],
            "session_title": m["session_title"],
            "game_name": m["game_name"],
            "game_icon": m["game_icon"],
            "match_number": m["match_number"],
            "match_type": m["match_type"],
            "is_practice": bool(m["is_practice"]),
            "played_at": str(m["played_at"]),
            "scores": scores
        })

    conn.close()
    return result
