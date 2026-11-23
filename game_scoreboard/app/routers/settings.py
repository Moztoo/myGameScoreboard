from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Dict, Any, Optional
from email_service import get_public_email_config, save_email_config, send_test_email

router = APIRouter(prefix="/api/settings", tags=["settings"])


class EmailConfigInput(BaseModel):
    is_enabled: bool = True
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    sender_email: str
    sender_name: str = "Game Scoreboard 🎮"
    smtp_password: Optional[str] = None
    use_tls: bool = True


@router.get("/email", response_model=Dict[str, Any])
def get_email_settings():
    return get_public_email_config()


@router.post("/email", response_model=Dict[str, Any])
def update_email_settings(data: EmailConfigInput):
    cfg_dict = data.model_dump() if hasattr(data, "model_dump") else data.dict()
    return save_email_config(cfg_dict)


@router.post("/email/test")
def trigger_test_email(override: Optional[EmailConfigInput] = None):
    try:
        override_dict = (override.model_dump() if hasattr(override, "model_dump") else override.dict()) if override else None
        result = send_test_email(override_dict)
        return result
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        error_msg = str(e)
        if "Username and Password not accepted" in error_msg or "535" in error_msg:
            detail = "Google rechazó las credenciales. Verifica que tu correo esté bien escrito y que estés usando una Contraseña de Aplicación válida de 16 letras."
        elif "Connection refused" in error_msg or "timeout" in error_msg.lower():
            detail = f"No se pudo conectar al servidor SMTP ({override.smtp_host if override else 'smtp.gmail.com'}). Revisa el host y puerto."
        else:
            detail = f"Error SMTP al enviar correo de prueba: {error_msg}"
        raise HTTPException(status_code=500, detail=detail)
