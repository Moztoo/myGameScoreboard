import json
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


@router.get("/timeline")
def get_timeline(game_id: Optional[str] = None, include_practice: bool = False, month: Optional[str] = None):
    """
    Get chronological score evolution across matches & sessions, plus meta records and character stats.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    query = """
    SELECT 
        m.id AS match_id,
        m.session_id,
        m.match_number,
        m.match_type,
        m.rule_values_json,
        m.is_practice,
        m.played_at,
        s.title AS session_title,
        s.started_at AS session_date,
        s.game_id,
        g.name AS game_name,
        g.icon AS game_icon
    FROM matches m
    JOIN sessions s ON m.session_id = s.id
    JOIN games g ON s.game_id = g.id
    WHERE 1=1
    """
    params = []
    if not include_practice:
        query += " AND m.is_practice = 0"
    if game_id:
        query += " AND (s.game_id = ? OR s.game_id LIKE ?)"
        params.extend([game_id, f"%{game_id}%"])
    if month:
        query += " AND strftime('%Y-%m', m.played_at) = ?"
        params.append(month)

    query += " ORDER BY m.played_at ASC, m.id ASC"
    cursor.execute(query, params)
    matches_rows = cursor.fetchall()

    # Players map
    cursor.execute("SELECT id, name, nickname, avatar_url, color_hex FROM players")
    players_map = {row["id"]: dict(row) for row in cursor.fetchall()}

    timeline_points = []
    player_cum_scores = {p_id: 0.0 for p_id in players_map}
    character_counter = {}
    record_score = {"player_name": None, "player_nickname": None, "score": 0.0, "match_title": None, "date": None, "character": None}

    for idx, m in enumerate(matches_rows, start=1):
        m_id = m["match_id"]
        cursor.execute("""
        SELECT ms.*, p.name AS player_name, p.nickname AS player_nickname, p.color_hex
        FROM match_scores ms
        JOIN players p ON ms.player_id = p.id
        WHERE ms.match_id = ?
        ORDER BY ms.rank_position ASC, ms.score DESC
        """, (m_id,))
        scores_rows = cursor.fetchall()

        scores_by_player = {}
        for sc in scores_rows:
            p_id = sc["player_id"]
            sc_val = sc["score"]
            rank_val = sc["rank_position"]
            metrics = json.loads(sc["metrics_json"] or "{}")
            char_name = metrics.get("character")
            kart_name = metrics.get("kart")

            player_cum_scores[p_id] = round(player_cum_scores[p_id] + sc_val, 1)

            scores_by_player[str(p_id)] = {
                "score": sc_val,
                "cumulative_score": player_cum_scores[p_id],
                "rank": rank_val,
                "character": char_name,
                "kart": kart_name
            }

            # Track records
            if sc_val > record_score["score"]:
                record_score = {
                    "player_name": sc["player_name"],
                    "player_nickname": sc["player_nickname"],
                    "score": sc_val,
                    "match_title": f"{m['session_title']} - P#{m['match_number']}",
                    "date": str(m["played_at"])[:10] if m["played_at"] else "",
                    "character": char_name
                }

            # Track character meta
            if char_name:
                if char_name not in character_counter:
                    character_counter[char_name] = {"character": char_name, "picks": 0, "wins": 0, "total_score": 0.0}
                character_counter[char_name]["picks"] += 1
                character_counter[char_name]["total_score"] += sc_val
                if rank_val == 1:
                    character_counter[char_name]["wins"] += 1

        date_str = str(m["played_at"])[:10] if m["played_at"] else str(m["session_date"])[:10]
        timeline_points.append({
            "match_id": m_id,
            "match_number": m["match_number"],
            "session_id": m["session_id"],
            "session_title": m["session_title"],
            "game_id": m["game_id"],
            "game_name": m["game_name"],
            "date": date_str,
            "label": f"#{m['match_number']} ({date_str[5:] if len(date_str) >= 5 else date_str})",
            "scores": scores_by_player
        })

    # Character stats list
    char_stats = []
    for c_name, c_data in character_counter.items():
        win_rate = round(c_data["wins"] / c_data["picks"] * 100, 1) if c_data["picks"] > 0 else 0.0
        avg_score = round(c_data["total_score"] / c_data["picks"], 1) if c_data["picks"] > 0 else 0.0
        char_stats.append({
            "character": c_name,
            "picks": c_data["picks"],
            "wins": c_data["wins"],
            "win_rate": win_rate,
            "avg_score": avg_score
        })
    char_stats.sort(key=lambda x: (x["wins"], x["picks"], x["avg_score"]), reverse=True)

    conn.close()

    return {
        "timeline": timeline_points,
        "players": players_map,
        "record_score": record_score if record_score["score"] > 0 else None,
        "character_stats": char_stats,
        "total_matches": len(timeline_points)
    }
