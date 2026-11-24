import json
from datetime import datetime
from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any, Optional
from database import get_db_connection, get_match_race_count

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

    # Calculate total and monthly races
    cursor.execute("SELECT rule_values_json, match_type FROM matches WHERE is_practice = 0")
    all_comp_matches = cursor.fetchall()
    total_races = sum(get_match_race_count(r["rule_values_json"], r["match_type"]) for r in all_comp_matches)

    current_month_str = datetime.now().strftime("%Y-%m")
    cursor.execute("""
    SELECT rule_values_json, match_type 
    FROM matches 
    WHERE is_practice = 0 AND strftime('%Y-%m', played_at) = ?
    """, (current_month_str,))
    month_matches = cursor.fetchall()
    monthly_races = sum(get_match_race_count(r["rule_values_json"], r["match_type"]) for r in month_matches)

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
        "total_races": total_races,
        "monthly_races": monthly_races,
        "top_game": top_game
    }


@router.get("/leaderboard")
def get_leaderboard(game_id: Optional[str] = None, include_practice: bool = False, month: Optional[str] = None):
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
    if month:
        query += " AND strftime('%Y-%m', m.played_at) = ?"
        params.append(month)

    query += """
    GROUP BY p.id
    ORDER BY wins DESC, total_score DESC, matches_played DESC
    """
    cursor.execute(query, params)
    rows = cursor.fetchall()

    # Calculate races per player (total and monthly)
    race_query = """
    SELECT ms.player_id, m.rule_values_json, m.match_type, m.played_at
    FROM match_scores ms
    JOIN matches m ON ms.match_id = m.id
    JOIN sessions s ON m.session_id = s.id
    WHERE 1=1
    """
    race_params = []
    if not include_practice:
        race_query += " AND m.is_practice = 0"
    if game_id:
        race_query += " AND s.game_id = ?"
        race_params.append(game_id)
    if month:
        race_query += " AND strftime('%Y-%m', m.played_at) = ?"
        race_params.append(month)

    cursor.execute(race_query, race_params)
    player_races = {}
    player_monthly_races = {}
    current_month_str = datetime.now().strftime("%Y-%m")

    for r_row in cursor.fetchall():
        pid = r_row["player_id"]
        rc = get_match_race_count(r_row["rule_values_json"], r_row["match_type"])
        player_races[pid] = player_races.get(pid, 0) + rc
        if str(r_row["played_at"] or "")[:7] == current_month_str:
            player_monthly_races[pid] = player_monthly_races.get(pid, 0) + rc

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
            "races_played": player_races.get(r["player_id"], 0),
            "monthly_races": player_monthly_races.get(r["player_id"], 0),
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
    player_cum_races = {p_id: 0 for p_id in players_map}
    character_counter = {}
    record_score = {"player_name": None, "player_nickname": None, "score": 0.0, "match_title": None, "date": None, "character": None}
    total_races_timeline = 0

    for idx, m in enumerate(matches_rows, start=1):
        m_id = m["match_id"]
        match_races = get_match_race_count(m["rule_values_json"], m["match_type"])
        total_races_timeline += match_races

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
            player_cum_races[p_id] = player_cum_races.get(p_id, 0) + match_races

            scores_by_player[str(p_id)] = {
                "score": sc_val,
                "cumulative_score": player_cum_scores[p_id],
                "races_played": player_cum_races[p_id],
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
            "race_count": match_races,
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
        "total_matches": len(timeline_points),
        "total_races": total_races_timeline,
        "player_races": player_cum_races
    }


@router.get("/tracks")
def get_tracks_and_classes_stats(game_id: Optional[str] = None, include_practice: bool = False):
    """Return performance analytics per track/cup and per class (150cc, 200cc, Espejo, etc.)."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Track-level stats from match_races + match_race_scores
    track_query = """
    SELECT
        mr.id AS race_id,
        mr.cup_name,
        mr.track_name,
        mr.class_mode,
        m.rule_values_json,
        mrs.player_id,
        mrs.position,
        mrs.points,
        p.name AS player_name,
        p.nickname AS player_nickname,
        p.color_hex
    FROM match_race_scores mrs
    JOIN match_races mr ON mrs.race_id = mr.id
    JOIN matches m ON mr.match_id = m.id
    JOIN sessions s ON m.session_id = s.id
    JOIN players p ON mrs.player_id = p.id
    WHERE 1=1
    """
    t_params = []
    if not include_practice:
        track_query += " AND m.is_practice = 0"
    if game_id:
        track_query += " AND s.game_id = ?"
        t_params.append(game_id)

    cursor.execute(track_query, t_params)
    race_score_rows = cursor.fetchall()

    tracks_map: Dict[str, Any] = {}
    for row in race_score_rows:
        t_name = row["track_name"] or "Pista Desconocida"
        if t_name not in tracks_map:
            tracks_map[t_name] = {
                "track_name": t_name,
                "cup_name": row["cup_name"] or "",
                "race_ids": set(),
                "players": {}
            }
        t_entry = tracks_map[t_name]
        if row["cup_name"] and not t_entry["cup_name"]:
            t_entry["cup_name"] = row["cup_name"]
        t_entry["race_ids"].add(row["race_id"])

        pid = row["player_id"]
        if pid not in t_entry["players"]:
            t_entry["players"][pid] = {
                "player_id": pid,
                "name": row["player_name"],
                "nickname": row["player_nickname"] or row["player_name"],
                "color_hex": row["color_hex"] or "#6366f1",
                "races": 0,
                "wins": 0,
                "podiums": 0,
                "pos_sum": 0,
                "points_sum": 0.0
            }
        p_stat = t_entry["players"][pid]
        p_stat["races"] += 1
        p_stat["pos_sum"] += row["position"]
        p_stat["points_sum"] = round(p_stat["points_sum"] + row["points"], 1)
        if row["position"] == 1:
            p_stat["wins"] += 1
        if row["position"] <= 3:
            p_stat["podiums"] += 1

    track_stats = []
    for t_name, t_data in tracks_map.items():
        players_list = []
        for pid, ps in t_data["players"].items():
            avg_pos = round(ps["pos_sum"] / ps["races"], 2) if ps["races"] > 0 else 0
            avg_pts = round(ps["points_sum"] / ps["races"], 1) if ps["races"] > 0 else 0
            players_list.append({
                "player_id": pid,
                "name": ps["name"],
                "nickname": ps["nickname"],
                "color_hex": ps["color_hex"],
                "races": ps["races"],
                "wins": ps["wins"],
                "podiums": ps["podiums"],
                "avg_position": avg_pos,
                "avg_points": avg_pts,
                "total_points": ps["points_sum"]
            })
        players_list.sort(key=lambda x: (-x["wins"], x["avg_position"], -x["avg_points"]))
        track_stats.append({
            "track_name": t_name,
            "cup_name": t_data["cup_name"],
            "times_played": len(t_data["race_ids"]),
            "best_player": players_list[0] if players_list else None,
            "players": players_list
        })
    track_stats.sort(key=lambda x: (-x["times_played"], x["track_name"]))

    # 2. Class-level stats (150cc, 200cc, Carrera espejo, etc.) from matches + match_scores
    class_query = """
    SELECT
        m.id AS match_id,
        m.match_type,
        m.rule_values_json,
        ms.player_id,
        ms.score,
        ms.rank_position,
        p.name AS player_name,
        p.nickname AS player_nickname,
        p.color_hex,
        (SELECT COUNT(*) FROM match_races mr WHERE mr.match_id = m.id) AS rec_races
    FROM match_scores ms
    JOIN matches m ON ms.match_id = m.id
    JOIN sessions s ON m.session_id = s.id
    JOIN players p ON ms.player_id = p.id
    WHERE 1=1
    """
    c_params = []
    if not include_practice:
        class_query += " AND m.is_practice = 0"
    if game_id:
        class_query += " AND s.game_id = ?"
        c_params.append(game_id)

    cursor.execute(class_query, c_params)
    classes_map: Dict[str, Any] = {}
    for row in cursor.fetchall():
        rules = json.loads(row["rule_values_json"] or "{}")
        clase = rules.get("clase") or rules.get("formato") or rules.get("duracion_tiempo") or "Estándar"
        m_races = get_match_race_count(rules, row["match_type"], row["rec_races"])

        if clase not in classes_map:
            classes_map[clase] = {
                "class_mode": clase,
                "match_ids": set(),
                "match_races_by_id": {},
                "players": {}
            }
        c_entry = classes_map[clase]
        c_entry["match_ids"].add(row["match_id"])
        c_entry["match_races_by_id"][row["match_id"]] = m_races

        pid = row["player_id"]
        if pid not in c_entry["players"]:
            c_entry["players"][pid] = {
                "player_id": pid,
                "name": row["player_name"],
                "nickname": row["player_nickname"] or row["player_name"],
                "color_hex": row["color_hex"] or "#6366f1",
                "matches": 0,
                "races": 0,
                "wins": 0,
                "rank_sum": 0,
                "total_points": 0.0
            }
        ps = c_entry["players"][pid]
        ps["matches"] += 1
        ps["races"] += m_races
        ps["rank_sum"] += row["rank_position"]
        ps["total_points"] = round(ps["total_points"] + row["score"], 1)
        if row["rank_position"] == 1:
            ps["wins"] += 1

    class_stats = []
    for c_mode, c_data in classes_map.items():
        standings = []
        for pid, ps in c_data["players"].items():
            avg_rank = round(ps["rank_sum"] / ps["matches"], 2) if ps["matches"] > 0 else 0
            win_rate = round(ps["wins"] / ps["matches"] * 100, 1) if ps["matches"] > 0 else 0
            standings.append({
                "player_id": pid,
                "name": ps["name"],
                "nickname": ps["nickname"],
                "color_hex": ps["color_hex"],
                "matches": ps["matches"],
                "races": ps["races"],
                "wins": ps["wins"],
                "win_rate": win_rate,
                "avg_rank": avg_rank,
                "total_points": ps["total_points"]
            })
        standings.sort(key=lambda x: (-x["wins"], -x["total_points"], x["avg_rank"]))
        class_stats.append({
            "class_mode": c_mode,
            "matches_count": len(c_data["match_ids"]),
            "races_count": sum(c_data["match_races_by_id"].values()),
            "leader": standings[0] if standings else None,
            "standings": standings
        })
    class_stats.sort(key=lambda x: (-x["races_count"], -x["matches_count"]))

    conn.close()
    return {
        "track_stats": track_stats,
        "class_stats": class_stats
    }
