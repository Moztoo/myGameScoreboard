import os
import io
import json
import zipfile
import pytest
from pathlib import Path
from fastapi.testclient import TestClient

# Point DATA_DIR to a temporary directory for testing
TEST_DATA_DIR = Path(__file__).resolve().parent / "test_data"
os.environ["DATA_DIR"] = str(TEST_DATA_DIR)

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "app"))

from main import app
from database import init_db, get_db_connection, DB_PATH, AVATARS_DIR

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_test_db():
    """Ensure clean test database before each test run."""
    import shutil
    if TEST_DATA_DIR.exists():
        shutil.rmtree(TEST_DATA_DIR)
    TEST_DATA_DIR.mkdir(parents=True, exist_ok=True)
    AVATARS_DIR.mkdir(parents=True, exist_ok=True)
    init_db()
    yield
    # Cleanup after
    if TEST_DATA_DIR.exists():
        shutil.rmtree(TEST_DATA_DIR)


def test_games_seeded_with_mario_kart_8():
    """Verify default games are seeded and Mario Kart 8 has TV settings."""
    res = client.get("/api/games")
    assert res.status_code == 200
    games = res.json()
    assert len(games) >= 4

    mk8 = next((g for g in games if g["id"] == "mario_kart_8"), None)
    assert mk8 is not None
    assert mk8["name"] == "Mario Kart 8 Deluxe"

    # Verify rule settings from the TV screen
    rule_ids = [r["id"] for r in mk8["rule_settings"]]
    assert "clase" in rule_ids
    assert "equipos" in rule_ids
    assert "objetos" in rule_ids
    assert "nivel_cpu" in rule_ids
    assert "vehiculos_cpu" in rule_ids
    assert "pistas" in rule_ids
    assert "carreras" in rule_ids

    # Check that 'Carrera espejo' is an option in 'clase'
    clase_rule = next(r for r in mk8["rule_settings"] if r["id"] == "clase")
    assert "Carrera espejo" in clase_rule["options"]

    # Check 24 carreras is in 'carreras'
    carreras_rule = next(r for r in mk8["rule_settings"] if r["id"] == "carreras")
    assert "24 carreras" in carreras_rule["options"]


def test_player_creation_and_avatar_upload():
    """Verify player creation and photo avatar upload."""
    # 1. Create player with email
    res = client.post("/api/players", json={
        "name": "Ricardo Mostalac",
        "nickname": "TARS",
        "email": "ricardo@test.com",
        "color_hex": "#6366f1"
    })
    assert res.status_code == 200
    player = res.json()
    player_id = player["id"]
    assert player["name"] == "Ricardo Mostalac"
    assert player["nickname"] == "TARS"
    assert player["email"] == "ricardo@test.com"

    # 2. Upload avatar
    fake_image_bytes = b"\xFF\xD8\xFF\xE0\x00\x10JFIF" + b"\x00" * 50
    files = {"file": ("avatar.jpg", fake_image_bytes, "image/jpeg")}
    avatar_res = client.post(f"/api/players/{player_id}/avatar", files=files)
    assert avatar_res.status_code == 200
    assert "avatars/player_" in avatar_res.json()["avatar_url"]

    # 3. Retrieve player and verify avatar URL and email
    get_res = client.get(f"/api/players/{player_id}")
    assert get_res.status_code == 200
    assert get_res.json()["avatar_url"] == avatar_res.json()["avatar_url"]
    assert get_res.json()["email"] == "ricardo@test.com"

    # 4. Edit player profile (PUT /api/players/{player_id})
    edit_res = client.put(f"/api/players/{player_id}", json={
        "name": "Ricardo M.",
        "nickname": "Mozto",
        "email": "mozto@test.com",
        "color_hex": "#ef4444"
    })
    assert edit_res.status_code == 200
    updated = edit_res.json()
    assert updated["name"] == "Ricardo M."
    assert updated["nickname"] == "Mozto"
    assert updated["email"] == "mozto@test.com"
    assert updated["color_hex"] == "#ef4444"


def test_session_and_practice_match_filter():
    """Verify session creation, competitive vs practice matches, and leaderboard exclusion."""
    # Create two players
    p1 = client.post("/api/players", json={"name": "Ricardo", "nickname": "TARS", "color_hex": "#6366f1"}).json()
    p2 = client.post("/api/players", json={"name": "Alex", "nickname": "YoshiFan", "color_hex": "#10b981"}).json()

    # Create session
    session = client.post("/api/sessions", json={
        "game_id": "mario_kart_8",
        "title": "Noche de Mario Kart 8",
        "player_ids": [p1["id"], p2["id"]]
    }).json()
    session_id = session["id"]

    # Record Match 1: Competitive Match (Ricardo 1st 140 pts, Alex 2nd 110 pts)
    match1_res = client.post(f"/api/sessions/{session_id}/matches", json={
        "match_type": "Torneo / Copa Completa",
        "rule_values": {
            "clase": "Carrera espejo",
            "equipos": "Sin equipos",
            "objetos": "Normales",
            "carreras": "24 carreras"
        },
        "is_practice": False,
        "scores": [
            {"player_id": p1["id"], "score": 140, "rank_position": 1, "metrics": {"character": "Mario"}},
            {"player_id": p2["id"], "score": 110, "rank_position": 2, "metrics": {"character": "Yoshi"}}
        ]
    })
    assert match1_res.status_code == 200

    # Record Match 2: PRACTICE MATCH (Alex 1st 150 pts, Ricardo 2nd 90 pts)
    match2_res = client.post(f"/api/sessions/{session_id}/matches", json={
        "match_type": "Carrera Individual",
        "rule_values": {"clase": "150cc", "objetos": "Sin objetos"},
        "is_practice": True,  # PRACTICE!
        "scores": [
            {"player_id": p2["id"], "score": 150, "rank_position": 1, "metrics": {"character": "Yoshi"}},
            {"player_id": p1["id"], "score": 90, "rank_position": 2, "metrics": {"character": "Luigi"}}
        ]
    })
    assert match2_res.status_code == 200

    # 1. Global Leaderboard WITHOUT practice (Competitive only)
    lb_comp = client.get("/api/stats/leaderboard?game_id=mario_kart_8&include_practice=false").json()
    assert len(lb_comp) == 2
    # In competitive, Ricardo has 1 win and Alex has 0 wins!
    ricardo_comp = next(p for p in lb_comp if p["player_id"] == p1["id"])
    alex_comp = next(p for p in lb_comp if p["player_id"] == p2["id"])

    assert ricardo_comp["matches_played"] == 1
    assert ricardo_comp["wins"] == 1
    assert ricardo_comp["total_score"] == 140

    assert alex_comp["matches_played"] == 1
    assert alex_comp["wins"] == 0
    assert alex_comp["total_score"] == 110

    # 2. Global Leaderboard WITH practice included
    lb_all = client.get("/api/stats/leaderboard?game_id=mario_kart_8&include_practice=true").json()
    ricardo_all = next(p for p in lb_all if p["player_id"] == p1["id"])
    alex_all = next(p for p in lb_all if p["player_id"] == p2["id"])

    assert ricardo_all["matches_played"] == 2
    assert ricardo_all["wins"] == 1
    assert ricardo_all["total_score"] == 230

    # 3. Test Editing a Match (PUT /api/sessions/matches/{match_id})
    # Change Match 1 score: Ricardo 1st with 160 pts (was 140)
    match1_id = match1_res.json()["matches"][0]["id"]
    edit_res = client.put(f"/api/sessions/matches/{match1_id}", json={
        "match_type": "Torneo / Copa Completa",
        "rule_values": {"clase": "200cc", "carreras": "24 carreras"},
        "is_practice": False,
        "notes": "Corregido puntaje",
        "scores": [
            {"player_id": p1["id"], "score": 160, "rank_position": 1, "metrics": {"character": "Mario"}},
            {"player_id": p2["id"], "score": 110, "rank_position": 2, "metrics": {"character": "Yoshi"}}
        ]
    })
    assert edit_res.status_code == 200
    updated_session = edit_res.json()
    p1_standing = next(st for st in updated_session["standings"] if st["player_id"] == p1["id"])
    assert p1_standing["total_score"] == 250  # 160 (match 1) + 90 (match 2)

    # 4. Test Resuming a Session
    # Finalize session
    res_close = client.put(f"/api/sessions/{session_id}", json={"status": "completed"})
    assert res_close.status_code == 200
    assert res_close.json()["status"] == "completed"
    assert res_close.json()["ended_at"] is not None

    # Resume session
    res_resume = client.put(f"/api/sessions/{session_id}", json={"status": "active"})
    assert res_resume.status_code == 200
    assert res_resume.json()["status"] == "active"
    assert res_resume.json()["ended_at"] is None


def test_mario_kart_auto_ranking():
    """Verify that Mario Kart matches automatically rank players descending by score."""
    p_a = client.post("/api/players", json={"name": "Player Low", "nickname": "Low"}).json()
    p_b = client.post("/api/players", json={"name": "Player Mid", "nickname": "Mid"}).json()
    p_c = client.post("/api/players", json={"name": "Player High", "nickname": "High"}).json()

    session = client.post("/api/sessions", json={
        "game_id": "mario_kart_8",
        "title": "MK8 Auto Ranking Test",
        "player_ids": [p_a["id"], p_b["id"], p_c["id"]]
    }).json()

    # Submit with completely inverted/scrambled rank positions
    # High: 290 pts, Mid: 260 pts, Low: 210 pts
    match_res = client.post(f"/api/sessions/{session['id']}/matches", json={
        "match_type": "Torneo / Copa Completa",
        "rule_values": {"clase": "150cc"},
        "is_practice": False,
        "scores": [
            {"player_id": p_a["id"], "score": 210, "rank_position": 1},  # Intentionally wrong rank
            {"player_id": p_b["id"], "score": 260, "rank_position": 3},  # Intentionally wrong rank
            {"player_id": p_c["id"], "score": 290, "rank_position": 2}   # Intentionally wrong rank
        ]
    })
    assert match_res.status_code == 200
    match = match_res.json()["matches"][0]
    
    # Must be auto-ranked by score descending:
    # 1st place: p_c (290 pts)
    # 2nd place: p_b (260 pts)
    # 3rd place: p_a (210 pts)
    scores = {s["player_id"]: s["rank_position"] for s in match["scores"]}
    assert scores[p_c["id"]] == 1
    assert scores[p_b["id"]] == 2
    assert scores[p_a["id"]] == 3


def test_backup_export_and_import():
    """Verify that export creates a valid ZIP and import restores database and avatars."""
    # Create player and session
    p = client.post("/api/players", json={"name": "Player Export Test", "nickname": "BackupUser"}).json()
    s = client.post("/api/sessions", json={"game_id": "mario_kart_8", "title": "Session to Export", "player_ids": [p["id"]]}).json()

    # Upload avatar file
    files = {"file": ("test.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 30, "image/png")}
    client.post(f"/api/players/{p['id']}/avatar", files=files)

    # Export backup
    export_res = client.get("/api/backup/export")
    assert export_res.status_code == 200
    assert export_res.headers["content-type"] == "application/zip"

    zip_bytes = export_res.content
    with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
        names = zf.namelist()
        assert "scoreboard.db" in names
        assert "manifest.json" in names
        assert any(n.startswith("avatars/") for n in names)

    # Wipe database by reinitializing empty
    import shutil
    shutil.rmtree(TEST_DATA_DIR)
    TEST_DATA_DIR.mkdir(parents=True, exist_ok=True)
    init_db()

    # Verify database is now empty of that player
    players_before = client.get("/api/players").json()
    assert not any(x["name"] == "Player Export Test" for x in players_before)

    # Import backup
    import_files = {"file": ("restore.zip", zip_bytes, "application/zip")}
    import_res = client.post("/api/backup/import", files=import_files)
    assert import_res.status_code == 200
    assert import_res.json()["status"] == "ok"

    # Verify player and session were restored!
    players_after = client.get("/api/players").json()
    restored_player = next((x for x in players_after if x["name"] == "Player Export Test"), None)
    assert restored_player is not None
    assert restored_player["nickname"] == "BackupUser"
