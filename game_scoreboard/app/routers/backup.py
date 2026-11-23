import os
import io
import json
import zipfile
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import Response
from database import DB_PATH, AVATARS_DIR, DATA_DIR, get_db_connection, init_db

router = APIRouter(prefix="/api/backup", tags=["backup"])


@router.get("/export")
def export_backup():
    """Export database, game configurations, and player avatars into a downloadable ZIP archive."""
    if not DB_PATH.exists():
        raise HTTPException(status_code=404, detail="La base de datos aún no ha sido inicializada")

    # Force checkpoint on SQLite WAL before zipping
    try:
        conn = get_db_connection()
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE);")
        conn.close()
    except Exception as e:
        print(f"Error en checkpoint: {e}")

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        # Add database
        zip_file.write(DB_PATH, arcname="scoreboard.db")

        # Add manifest
        manifest = {
            "version": "1.0.0",
            "app": "myGameScoreboard",
            "exported_at": datetime.now(timezone.utc).isoformat()
        }
        zip_file.writestr("manifest.json", json.dumps(manifest, indent=2))

        # Add avatars
        if AVATARS_DIR.exists():
            for file_path in AVATARS_DIR.glob("*"):
                if file_path.is_file():
                    zip_file.write(file_path, arcname=f"avatars/{file_path.name}")

    zip_buffer.seek(0)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"scoreboard_backup_{timestamp}.zip"

    return Response(
        content=zip_buffer.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.post("/import")
async def import_backup(file: UploadFile = File(...)):
    """Import and restore database and avatars from a previously exported ZIP archive."""
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="El archivo de respaldo debe ser un formato .zip")

    content = await file.read()
    zip_buffer = io.BytesIO(content)

    try:
        with zipfile.ZipFile(zip_buffer, "r") as zip_file:
            names = zip_file.namelist()
            if "scoreboard.db" not in names:
                raise HTTPException(status_code=400, detail="Archivo ZIP inválido: falta 'scoreboard.db'")

            # Validate that the extracted DB is a valid SQLite file
            temp_db_path = DATA_DIR / "temp_import.db"
            with open(temp_db_path, "wb") as f:
                f.write(zip_file.read("scoreboard.db"))

            # Test connection to temp DB
            test_conn = sqlite3.connect(str(temp_db_path))
            test_cur = test_conn.cursor()
            test_cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='games'")
            if not test_cur.fetchone():
                test_conn.close()
                temp_db_path.unlink(missing_ok=True)
                raise HTTPException(status_code=400, detail="Base de datos corrupta o incompatible")
            test_conn.close()

            # Replace main database
            if DB_PATH.exists():
                # Remove WAL/SHM files if any
                wal_path = DATA_DIR / "scoreboard.db-wal"
                shm_path = DATA_DIR / "scoreboard.db-shm"
                wal_path.unlink(missing_ok=True)
                shm_path.unlink(missing_ok=True)

            shutil.move(str(temp_db_path), str(DB_PATH))

            # Extract avatars
            AVATARS_DIR.mkdir(parents=True, exist_ok=True)
            for item in names:
                if item.startswith("avatars/") and not item.endswith("/"):
                    filename = Path(item).name
                    avatar_bytes = zip_file.read(item)
                    with open(AVATARS_DIR / filename, "wb") as f:
                        f.write(avatar_bytes)

    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="El archivo subido no es un archivo ZIP válido")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error durante la restauración: {str(e)}")

    # Reconnect and run schema updates if needed
    init_db()

    return {
        "status": "ok",
        "message": "Respaldo restaurado con éxito. Se recuperaron partidas, jugadores y avatares."
    }
