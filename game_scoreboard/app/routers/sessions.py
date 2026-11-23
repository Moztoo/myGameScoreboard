from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import List, Dict, Any, Optional
import json
from database import get_db_connection
from models import SessionCreate, SessionUpdate, MatchCreate
from email_service import trigger_session_finished_automations

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.get("", response_model=List[Dict[str, Any]])
def list_sessions(game_id: Optional[str] = None, status: Optional[str] = None):
    conn = get_db_connection()
    cursor = conn.cursor()

    query = """
    SELECT 
        s.id, s.game_id, s.title, s.started_at, s.ended_at, s.status, s.notes,
        g.name AS game_name, g.icon AS game_icon,
        COUNT(DISTINCT m.id) AS total_matches
    FROM sessions s
    JOIN games g ON s.game_id = g.id
    LEFT JOIN matches m ON s.id = m.session_id
    WHERE 1=1
    """
    params = []
    if game_id:
        query += " AND s.game_id = ?"
        params.append(game_id)
    if status:
        query += " AND s.status = ?"
        params.append(status)

    query += " GROUP BY s.id ORDER BY s.started_at DESC"
    cursor.execute(query, params)
    rows = cursor.fetchall()

    result = []
    for r in rows:
        session_id = r["id"]
        # Fetch participating players
        cursor.execute("""
        SELECT p.id, p.name, p.nickname, p.email, p.avatar_url, p.color_hex
        FROM players p
        JOIN session_players sp ON p.id = sp.player_id
        WHERE sp.session_id = ?
        ORDER BY p.name ASC
        """, (session_id,))
        players = [dict(p) for p in cursor.fetchall()]

        result.append({
            "id": r["id"],
            "game_id": r["game_id"],
            "game_name": r["game_name"],
            "game_icon": r["game_icon"],
            "title": r["title"],
            "started_at": str(r["started_at"]),
            "ended_at": str(r["ended_at"]) if r["ended_at"] else None,
            "status": r["status"],
            "notes": r["notes"] or "",
            "total_matches": r["total_matches"] or 0,
            "players": players
        })

    conn.close()
    return result


@router.get("/{session_id}", response_model=Dict[str, Any])
def get_session(session_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
    SELECT s.*, g.name AS game_name, g.icon AS game_icon, g.scoring_type
    FROM sessions s
    JOIN games g ON s.game_id = g.id
    WHERE s.id = ?
    """, (session_id,))
    session = cursor.fetchone()
    if not session:
        conn.close()
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    # Fetch participating players
    cursor.execute("""
    SELECT p.id, p.name, p.nickname, p.email, p.avatar_url, p.color_hex
    FROM players p
    JOIN session_players sp ON p.id = sp.player_id
    WHERE sp.session_id = ?
    ORDER BY p.name ASC
    """, (session_id,))
    players = [dict(p) for p in cursor.fetchall()]

    # Fetch matches
    cursor.execute("""
    SELECT * FROM matches WHERE session_id = ? ORDER BY match_number ASC, id ASC
    """, (session_id,))
    matches_rows = cursor.fetchall()

    matches = []
    # Player score aggregations for session standings
    player_points = {p["id"]: {"total_score": 0.0, "wins": 0, "podiums": 0, "matches_played": 0} for p in players}

    for m in matches_rows:
        match_id = m["id"]
        cursor.execute("""
        SELECT ms.*, p.name AS player_name, p.nickname AS player_nickname, p.avatar_url, p.color_hex
        FROM match_scores ms
        JOIN players p ON ms.player_id = p.id
        WHERE ms.match_id = ?
        ORDER BY ms.rank_position ASC, ms.score DESC
        """, (match_id,))
        scores_rows = cursor.fetchall()
        
        scores = []
        for sc in scores_rows:
            p_id = sc["player_id"]
            score_val = sc["score"]
            rank_val = sc["rank_position"]
            metrics = json.loads(sc["metrics_json"] or "{}")

            scores.append({
                "id": sc["id"],
                "player_id": p_id,
                "player_name": sc["player_name"],
                "player_nickname": sc["player_nickname"] or "",
                "avatar_url": sc["avatar_url"],
                "color_hex": sc["color_hex"],
                "score": score_val,
                "rank_position": rank_val,
                "metrics": metrics
            })

            # Accumulate session standings
            if p_id in player_points:
                player_points[p_id]["total_score"] += score_val
                player_points[p_id]["matches_played"] += 1
                if rank_val == 1:
                    player_points[p_id]["wins"] += 1
                if rank_val <= 3:
                    player_points[p_id]["podiums"] += 1

        matches.append({
            "id": m["id"],
            "session_id": m["session_id"],
            "match_number": m["match_number"],
            "match_type": m["match_type"],
            "rule_values": json.loads(m["rule_values_json"] or "{}"),
            "is_practice": bool(m["is_practice"]),
            "notes": m["notes"] or "",
            "played_at": str(m["played_at"]),
            "scores": scores
        })

    # Build standings list
    standings = []
    for p in players:
        p_id = p["id"]
        stats = player_points.get(p_id, {"total_score": 0.0, "wins": 0, "podiums": 0, "matches_played": 0})
        standings.append({
            "player_id": p_id,
            "name": p["name"],
            "nickname": p["nickname"],
            "avatar_url": p["avatar_url"],
            "color_hex": p["color_hex"],
            "total_score": stats["total_score"],
            "wins": stats["wins"],
            "podiums": stats["podiums"],
            "matches_played": stats["matches_played"]
        })

    # Sort standings depending on scoring_type
    scoring_type = session["scoring_type"]
    if scoring_type == "points_low":
        standings.sort(key=lambda x: (x["total_score"], -x["wins"]))
    else:
        standings.sort(key=lambda x: (-x["total_score"], -x["wins"]))

    conn.close()

    return {
        "id": session["id"],
        "game_id": session["game_id"],
        "game_name": session["game_name"],
        "game_icon": session["game_icon"],
        "scoring_type": scoring_type,
        "title": session["title"],
        "status": session["status"],
        "started_at": str(session["started_at"]),
        "ended_at": str(session["ended_at"]) if session["ended_at"] else None,
        "notes": session["notes"] or "",
        "players": players,
        "matches": matches,
        "standings": standings
    }


@router.post("", response_model=Dict[str, Any])
def create_session(data: SessionCreate):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM games WHERE id = ?", (data.game_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="Juego inválido")

    cursor.execute("""
    INSERT INTO sessions (game_id, title, notes, status)
    VALUES (?, ?, ?, 'active')
    """, (data.game_id, data.title, data.notes or ""))
    session_id = cursor.lastrowid

    # Add participating players
    for p_id in data.player_ids:
        cursor.execute("""
        INSERT OR IGNORE INTO session_players (session_id, player_id)
        VALUES (?, ?)
        """, (session_id, p_id))

    conn.commit()
    conn.close()
    return get_session(session_id)


@router.put("/{session_id}", response_model=Dict[str, Any])
def update_session(session_id: int, data: SessionUpdate, background_tasks: BackgroundTasks):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
    existing = cursor.fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    title = data.title if data.title is not None else existing["title"]
    notes = data.notes if data.notes is not None else existing["notes"]
    status = data.status if data.status is not None else existing["status"]
    ended_at = data.ended_at if data.ended_at is not None else existing["ended_at"]

    if status == "completed" and not ended_at:
        cursor.execute("""
        UPDATE sessions SET title = ?, notes = ?, status = ?, ended_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """, (title, notes, status, session_id))
        if existing["status"] != "completed":
            background_tasks.add_task(trigger_session_finished_automations, session_id)
    elif status == "active":
        cursor.execute("""
        UPDATE sessions SET title = ?, notes = ?, status = 'active', ended_at = NULL
        WHERE id = ?
        """, (title, notes, session_id))
    else:
        cursor.execute("""
        UPDATE sessions SET title = ?, notes = ?, status = ?, ended_at = ?
        WHERE id = ?
        """, (title, notes, status, ended_at, session_id))

    conn.commit()
    conn.close()
    return get_session(session_id)


@router.put("/matches/{match_id}", response_model=Dict[str, Any])
def update_match(match_id: int, match_data: MatchCreate):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
    SELECT m.session_id, m.match_number, s.game_id, g.name AS game_name
    FROM matches m
    JOIN sessions s ON m.session_id = s.id
    JOIN games g ON s.game_id = g.id
    WHERE m.id = ?
    """, (match_id,))
    existing = cursor.fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Partida no encontrada")
    session_id = existing["session_id"]
    game_id = (existing["game_id"] or "").lower()
    game_name = (existing["game_name"] or "").lower()
    is_mario_kart = "mario_kart" in game_id or "mario kart" in game_name or "mariokart" in game_id

    # Auto-rank Mario Kart matches by score descending
    if is_mario_kart and match_data.scores:
        match_data.scores.sort(key=lambda s: s.score, reverse=True)
        for rank_idx, sc in enumerate(match_data.scores, start=1):
            sc.rank_position = rank_idx

    cursor.execute("""
    UPDATE matches SET
        match_type = ?,
        rule_values_json = ?,
        is_practice = ?,
        notes = ?
    WHERE id = ?
    """, (
        match_data.match_type,
        json.dumps(match_data.rule_values),
        1 if match_data.is_practice else 0,
        match_data.notes or "",
        match_id
    ))

    # Replace scores for this match
    cursor.execute("DELETE FROM match_scores WHERE match_id = ?", (match_id,))

    for sc in match_data.scores:
        cursor.execute("""
        INSERT INTO match_scores (match_id, player_id, score, rank_position, metrics_json)
        VALUES (?, ?, ?, ?, ?)
        """, (
            match_id,
            sc.player_id,
            sc.score,
            sc.rank_position,
            json.dumps(sc.metrics)
        ))

        cursor.execute("""
        INSERT OR IGNORE INTO session_players (session_id, player_id)
        VALUES (?, ?)
        """, (session_id, sc.player_id))

    conn.commit()
    conn.close()
    return get_session(session_id)


@router.post("/{session_id}/matches", response_model=Dict[str, Any])
def add_match(session_id: int, match_data: MatchCreate):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
    SELECT s.id, s.game_id, g.name AS game_name
    FROM sessions s
    JOIN games g ON s.game_id = g.id
    WHERE s.id = ?
    """, (session_id,))
    session_row = cursor.fetchone()
    if not session_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    game_id = (session_row["game_id"] or "").lower()
    game_name = (session_row["game_name"] or "").lower()
    is_mario_kart = "mario_kart" in game_id or "mario kart" in game_name or "mariokart" in game_id

    # Auto-rank Mario Kart matches by score descending
    if is_mario_kart and match_data.scores:
        match_data.scores.sort(key=lambda s: s.score, reverse=True)
        for rank_idx, sc in enumerate(match_data.scores, start=1):
            sc.rank_position = rank_idx

    # Determine match number
    cursor.execute("SELECT COALESCE(MAX(match_number), 0) + 1 AS next_num FROM matches WHERE session_id = ?", (session_id,))
    next_num = cursor.fetchone()["next_num"]

    cursor.execute("""
    INSERT INTO matches (session_id, match_number, match_type, rule_values_json, is_practice, notes)
    VALUES (?, ?, ?, ?, ?, ?)
    """, (
        session_id,
        next_num,
        match_data.match_type,
        json.dumps(match_data.rule_values),
        1 if match_data.is_practice else 0,
        match_data.notes or ""
    ))
    match_id = cursor.lastrowid

    # Insert individual scores
    for sc in match_data.scores:
        cursor.execute("""
        INSERT INTO match_scores (match_id, player_id, score, rank_position, metrics_json)
        VALUES (?, ?, ?, ?, ?)
        """, (
            match_id,
            sc.player_id,
            sc.score,
            sc.rank_position,
            json.dumps(sc.metrics)
        ))

        # Ensure player is linked to session_players
        cursor.execute("""
        INSERT OR IGNORE INTO session_players (session_id, player_id)
        VALUES (?, ?)
        """, (session_id, sc.player_id))

    conn.commit()
    conn.close()
    return get_session(session_id)


@router.delete("/matches/{match_id}")
def delete_match(match_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT session_id FROM matches WHERE id = ?", (match_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Partida no encontrada")
    session_id = row["session_id"]

    cursor.execute("DELETE FROM matches WHERE id = ?", (match_id,))
    conn.commit()
    conn.close()
    return {"status": "ok", "session_id": session_id}


@router.delete("/{session_id}")
def delete_session(session_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
    conn.commit()
    conn.close()
    return {"status": "ok", "message": f"Sesión {session_id} eliminada"}
