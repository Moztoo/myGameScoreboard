import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware

from database import init_db, AVATARS_DIR
from routers import games, players, sessions, stats, backup, settings

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
INDEX_HTML = STATIC_DIR / "index.html"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


# Initialize FastAPI app
app = FastAPI(
    title="Game Scoreboard Add-on",
    description="Scoreboard nativo de videojuegos para Home Assistant",
    version="1.1.0",
    lifespan=lifespan
)

# CORS middleware for development flexibility
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(games.router)
app.include_router(players.router)
app.include_router(sessions.router)
app.include_router(stats.router)
app.include_router(backup.router)
app.include_router(settings.router)

# Ensure avatar and static directories
AVATARS_DIR.mkdir(parents=True, exist_ok=True)
STATIC_DIR.mkdir(parents=True, exist_ok=True)


# Serve avatars
@app.get("/avatars/{filename}")
async def serve_avatar(filename: str):
    file_path = AVATARS_DIR / filename
    if file_path.exists() and file_path.is_file():
        return FileResponse(str(file_path))
    return HTMLResponse(status_code=404, content="Avatar not found")


NO_CACHE_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
}


# Serve static assets directly without Mount prefix collisions
@app.get("/static/{file_path:path}")
async def serve_static(file_path: str):
    target = STATIC_DIR / file_path
    if target.exists() and target.is_file():
        # Set proper Content-Type and disable aggressive client caching
        if file_path.endswith(".js"):
            return FileResponse(str(target), media_type="application/javascript", headers=NO_CACHE_HEADERS)
        if file_path.endswith(".css"):
            return FileResponse(str(target), media_type="text/css", headers=NO_CACHE_HEADERS)
        return FileResponse(str(target), headers=NO_CACHE_HEADERS)
    return HTMLResponse(status_code=404, content="Static asset not found")


@app.get("/", response_class=HTMLResponse)
async def serve_spa_root(request: Request):
    """Serve the single page application, injecting the dynamic Ingress path."""
    ingress_path = request.headers.get("X-Ingress-Path", "")
    if not INDEX_HTML.exists():
        return HTMLResponse(
            "<h1>Game Scoreboard Backend Running</h1><p>Frontend assets are being prepared.</p>"
        )

    with open(INDEX_HTML, "r", encoding="utf-8") as f:
        content = f.read()

    # Calculate ingress base with trailing slash for <base href="...">
    if ingress_path:
        ingress_base = ingress_path if ingress_path.endswith("/") else f"{ingress_path}/"
    else:
        ingress_base = "./"

    content = content.replace("__INGRESS_PATH_PLACEHOLDER__", ingress_path)
    content = content.replace("__INGRESS_BASE_PLACEHOLDER__", ingress_base)
    return HTMLResponse(content=content, headers=NO_CACHE_HEADERS)


@app.get("/{full_path:path}", response_class=HTMLResponse)
async def catch_all_spa(request: Request, full_path: str):
    """Catch-all for SPA navigation."""
    if full_path.startswith("api/") or full_path.startswith("static/") or full_path.startswith("avatars/"):
        return HTMLResponse(status_code=404, content="Not found")
    return await serve_spa_root(request)
