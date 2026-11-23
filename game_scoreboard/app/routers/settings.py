from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
from email_service import (
    get_public_email_config,
    save_email_config,
    send_test_email,
    get_email_logs,
    clear_email_logs,
    list_email_templates,
    get_email_template,
    update_email_template,
    list_automations,
    get_automation,
    create_automation,
    update_automation,
    toggle_automation,
    duplicate_automation,
    delete_automation,
    execute_automation
)

router = APIRouter(prefix="/api/settings", tags=["settings"])


# -----------------------------------------------------------------------------
# PYDANTIC SCHEMAS
# -----------------------------------------------------------------------------
class EmailConfigInput(BaseModel):
    is_enabled: bool = True
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    sender_email: str
    sender_name: str = "Game Scoreboard 🎮"
    smtp_password: Optional[str] = None
    use_tls: bool = True


class TestEmailInput(BaseModel):
    target_email: str
    sender_email: Optional[str] = None
    smtp_password: Optional[str] = None
    sender_name: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    use_tls: Optional[bool] = None


class TemplateUpdateInput(BaseModel):
    name: str
    subject_template: str
    banner_url: str = "static/img/email_banner.jpg"
    intro_text: Optional[str] = ""
    include_podium: bool = True
    include_standings: bool = True
    include_matches: bool = True
    include_metrics: bool = True
    footer_text: Optional[str] = ""


class AutomationInput(BaseModel):
    name: str
    trigger_type: str = "session_finished"  # session_finished, monthly, weekly
    content_type: str = "session_summary"  # session_summary, global_leaderboard, monthly_summary
    template_id: str = "session_mario_kart"
    target_recipients: str = "session_participants"  # session_participants, all_players, custom
    custom_emails: Optional[str] = ""
    is_active: bool = True


# -----------------------------------------------------------------------------
# EMAIL CONFIG & DEBUG TEST
# -----------------------------------------------------------------------------
@router.get("/email", response_model=Dict[str, Any])
def get_email_settings():
    return get_public_email_config()


@router.post("/email", response_model=Dict[str, Any])
def update_email_settings(data: EmailConfigInput):
    cfg_dict = data.model_dump() if hasattr(data, "model_dump") else data.dict()
    return save_email_config(cfg_dict)


@router.post("/email/test")
def trigger_test_email(data: TestEmailInput):
    try:
        target = data.target_email.strip()
        override_dict = data.model_dump() if hasattr(data, "model_dump") else data.dict()
        result = send_test_email(target_email=target, override_config=override_dict)
        return result
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        error_msg = str(e)
        if "Username and Password not accepted" in error_msg or "535" in error_msg:
            detail = "Google rechazó las credenciales. Verifica tu correo y que tu contraseña de aplicación de 16 caracteres sea correcta."
        elif "Connection refused" in error_msg or "timeout" in error_msg.lower():
            detail = f"No se pudo conectar al servidor SMTP. Revisa el host y puerto."
        else:
            detail = f"Error SMTP al enviar correo de prueba: {error_msg}"
        raise HTTPException(status_code=500, detail=detail)


# -----------------------------------------------------------------------------
# EMAIL LOGS
# -----------------------------------------------------------------------------
@router.get("/email/logs", response_model=List[Dict[str, Any]])
def list_logs(limit: int = 50):
    return get_email_logs(limit=limit)


@router.delete("/email/logs")
def clear_logs():
    clear_email_logs()
    return {"status": "ok", "message": "Logs eliminados"}


# -----------------------------------------------------------------------------
# EMAIL TEMPLATES
# -----------------------------------------------------------------------------
@router.get("/templates", response_model=List[Dict[str, Any]])
def get_templates():
    return list_email_templates()


@router.get("/templates/{template_id}", response_model=Dict[str, Any])
def get_single_template(template_id: str):
    t = get_email_template(template_id)
    if not t:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")
    return t


@router.put("/templates/{template_id}", response_model=Dict[str, Any])
def update_template(template_id: str, data: TemplateUpdateInput):
    try:
        d = data.model_dump() if hasattr(data, "model_dump") else data.dict()
        return update_email_template(template_id, d)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))


# -----------------------------------------------------------------------------
# AUTOMATIONS (CRUD)
# -----------------------------------------------------------------------------
@router.get("/automations", response_model=List[Dict[str, Any]])
def get_all_automations():
    return list_automations()


@router.post("/automations", response_model=Dict[str, Any])
def add_automation(data: AutomationInput):
    d = data.model_dump() if hasattr(data, "model_dump") else data.dict()
    return create_automation(d)


@router.put("/automations/{automation_id}", response_model=Dict[str, Any])
def edit_automation(automation_id: int, data: AutomationInput):
    try:
        d = data.model_dump() if hasattr(data, "model_dump") else data.dict()
        return update_automation(automation_id, d)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))


@router.post("/automations/{automation_id}/toggle", response_model=Dict[str, Any])
def toggle_auto(automation_id: int):
    try:
        return toggle_automation(automation_id)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))


@router.post("/automations/{automation_id}/duplicate", response_model=Dict[str, Any])
def duplicate_auto(automation_id: int):
    try:
        return duplicate_automation(automation_id)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))


@router.delete("/automations/{automation_id}")
def remove_automation(automation_id: int):
    delete_automation(automation_id)
    return {"status": "ok", "message": f"Automatización {automation_id} eliminada"}


@router.post("/automations/{automation_id}/execute")
def trigger_now(automation_id: int, background_tasks: BackgroundTasks):
    auto = get_automation(automation_id)
    if not auto:
        raise HTTPException(status_code=404, detail="Automatización no encontrada")

    # If it's session_summary, fetch latest completed session
    context = {}
    if auto["content_type"] == "session_summary":
        from database import get_db_connection
        from routers.sessions import get_session
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM sessions ORDER BY id DESC LIMIT 1")
        row = cursor.fetchone()
        conn.close()
        if row:
            context["session"] = get_session(row["id"])

    try:
        res = execute_automation(auto, context=context)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al ejecutar automatización: {str(e)}")
