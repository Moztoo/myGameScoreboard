import os
import json
import smtplib
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, List, Optional
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage

from database import DATA_DIR, BASE_DIR, get_db_connection

EMAIL_CONFIG_FILE = DATA_DIR / "email_config.json"
DEFAULT_BANNER_PATH = BASE_DIR / "static" / "img" / "email_banner.jpg"


# -----------------------------------------------------------------------------
# CONFIGURATION
# -----------------------------------------------------------------------------
def get_email_config() -> Dict[str, Any]:
    """Retrieve saved email configuration, or sensible defaults."""
    default_config = {
        "is_enabled": True,
        "smtp_host": "smtp.gmail.com",
        "smtp_port": 587,
        "sender_email": "",
        "sender_name": "Game Scoreboard 🎮",
        "smtp_password": "",
        "use_tls": True
    }
    if EMAIL_CONFIG_FILE.exists():
        try:
            with open(EMAIL_CONFIG_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                default_config.update(saved)
        except Exception as e:
            print(f"[EmailService] Error loading config: {e}")
    return default_config


def save_email_config(config: Dict[str, Any]) -> Dict[str, Any]:
    """Save email configuration to disk."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    existing = get_email_config()

    new_pw = (config.get("smtp_password") or "").strip()
    if not new_pw or new_pw == "********":
        config["smtp_password"] = existing.get("smtp_password", "")
    else:
        config["smtp_password"] = new_pw.replace(" ", "")

    existing.update(config)
    with open(EMAIL_CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(existing, f, indent=2)

    return get_public_email_config()


def get_public_email_config() -> Dict[str, Any]:
    """Return config with password masked for frontend security."""
    cfg = get_email_config()
    pw = cfg.get("smtp_password", "")
    return {
        "is_enabled": cfg.get("is_enabled", True),
        "smtp_host": cfg.get("smtp_host", "smtp.gmail.com"),
        "smtp_port": cfg.get("smtp_port", 587),
        "sender_email": cfg.get("sender_email", ""),
        "sender_name": cfg.get("sender_name", "Game Scoreboard 🎮"),
        "has_password": bool(pw),
        "use_tls": cfg.get("use_tls", True)
    }


# -----------------------------------------------------------------------------
# LOGGING
# -----------------------------------------------------------------------------
def log_email(recipient: str, subject: str, trigger_type: str, status: str, error_message: Optional[str] = None):
    """Save an email attempt record into email_logs."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO email_logs (recipient, subject, trigger_type, status, error_message)
        VALUES (?, ?, ?, ?, ?)
        """, (recipient, subject, trigger_type, status, error_message))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[EmailService] Error writing email log: {e}")


def get_email_logs(limit: int = 50) -> List[Dict[str, Any]]:
    """Fetch recent email logs."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT id, recipient, subject, trigger_type, status, error_message, created_at
    FROM email_logs
    ORDER BY id DESC
    LIMIT ?
    """, (limit,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


def clear_email_logs():
    """Clear all email logs."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM email_logs")
    conn.commit()
    conn.close()


# -----------------------------------------------------------------------------
# LOW-LEVEL SMTP SENDER
# -----------------------------------------------------------------------------
def send_mime_message(recipients: List[str], subject: str, html_body: str, plain_body: str, trigger_type: str = "custom", banner_file: Optional[Path] = None, override_config: Optional[Dict[str, Any]] = None):
    """
    Connect to SMTP and deliver email to recipients, recording status in email_logs.
    """
    cfg = get_email_config()
    if override_config:
        new_pw = (override_config.get("smtp_password") or "").strip()
        if new_pw and new_pw != "********":
            override_config["smtp_password"] = new_pw.replace(" ", "")
        else:
            override_config["smtp_password"] = cfg.get("smtp_password", "")
        cfg.update({k: v for k, v in override_config.items() if v is not None})

    sender_email = (cfg.get("sender_email") or "").strip()
    smtp_password = (cfg.get("smtp_password") or "").strip()
    smtp_host = (cfg.get("smtp_host") or "smtp.gmail.com").strip()
    smtp_port = int(cfg.get("smtp_port") or 587)
    sender_name = cfg.get("sender_name") or "Game Scoreboard 🎮"
    use_tls = cfg.get("use_tls", True)

    if not sender_email or not smtp_password:
        raise ValueError("Configuración SMTP incompleta: Ingresa tu correo remitente y la contraseña de aplicación de Google.")

    if not recipients:
        raise ValueError("No hay destinatarios especificados para enviar el correo.")

    msg_root = MIMEMultipart("related")
    msg_root["Subject"] = subject
    msg_root["From"] = f"{sender_name} <{sender_email}>"
    msg_root["To"] = ", ".join(recipients)

    msg_alternative = MIMEMultipart("alternative")
    msg_root.attach(msg_alternative)

    msg_alternative.attach(MIMEText(plain_body, "plain", "utf-8"))
    msg_alternative.attach(MIMEText(html_body, "html", "utf-8"))

    # Attach banner if specified or available
    img_to_attach = banner_file if (banner_file and banner_file.exists()) else (DEFAULT_BANNER_PATH if DEFAULT_BANNER_PATH.exists() else None)
    if img_to_attach and img_to_attach.exists():
        try:
            subtype = "png" if img_to_attach.suffix.lower() == ".png" else "jpeg"
            with open(img_to_attach, "rb") as img_f:
                img_part = MIMEImage(img_f.read(), _subtype=subtype)
                img_part.add_header("Content-ID", "<tournament_banner>")
                img_part.add_header("Content-Disposition", "inline", filename=img_to_attach.name)
                msg_root.attach(img_part)
        except Exception as e:
            print(f"[EmailService] Could not attach banner: {e}")

    try:
        server = smtplib.SMTP(smtp_host, smtp_port, timeout=12)
        if use_tls:
            server.starttls()
        server.login(sender_email, smtp_password)
        server.sendmail(sender_email, recipients, msg_root.as_string())
        server.quit()

        # Log successes
        for r in recipients:
            log_email(recipient=r, subject=subject, trigger_type=trigger_type, status="sent")

        return {"status": "ok", "recipients": recipients}
    except Exception as e:
        error_msg = str(e)
        for r in recipients:
            log_email(recipient=r, subject=subject, trigger_type=trigger_type, status="failed", error_message=error_msg)
        raise


# -----------------------------------------------------------------------------
# TEST EMAIL (TARGETED MANUAL EMAIL)
# -----------------------------------------------------------------------------
def send_test_email(target_email: str, override_config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Send a test email ONLY to a single specified target email address for debugging.
    """
    target = (target_email or "").strip()
    if not target or "@" not in target:
        raise ValueError("Ingresa una dirección de correo válida para realizar la prueba.")

    subject = "🎮 Game Scoreboard: Prueba de Conexión SMTP Exitosa 🏁"

    html_content = f"""
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Prueba de Conexión</title>
    </head>
    <body style="margin: 0; padding: 20px; background-color: #020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
        <tr>
          <td style="padding: 0; text-align: center; background-color: #090d16;">
            <img src="cid:tournament_banner" alt="Game Scoreboard" width="600" style="width: 100%; max-width: 600px; height: auto; display: block; border-top-left-radius: 20px; border-top-right-radius: 20px; margin: 0 auto;" />
          </td>
        </tr>
        <tr>
          <td style="padding: 28px 24px;">
            <div style="background-color: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 12px; padding: 6px 12px; display: inline-block; margin-bottom: 16px;">
              <span style="color: #818cf8; font-size: 11px; font-weight: bold; text-transform: uppercase;">⚡ Correo de Depuración</span>
            </div>

            <h1 style="color: #ffffff; font-size: 20px; font-weight: 800; margin: 0 0 10px 0;">
              ¡Conexión SMTP exitosa! 🚀
            </h1>
            <p style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin: 0 0 20px 0;">
              Este es un correo de prueba de depuración enviado exclusivamente a <strong>{target}</strong> desde tu complemento de Home Assistant.
            </p>

            <div style="background-color: #090d16; border: 1px solid #1e293b; border-radius: 14px; padding: 14px; margin-bottom: 20px;">
              <div style="color: #cbd5e1; font-size: 12px; line-height: 1.6;">
                ✔ Servidor SMTP conectado correctamente.<br>
                ✔ Autenticación TLS verificada.<br>
                ✔ Fecha y hora de prueba: <strong>{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</strong>
              </div>
            </div>

            <p style="color: #64748b; font-size: 11px; text-align: center; margin: 20px 0 0 0; border-top: 1px solid #1e293b; padding-top: 14px;">
              Game Scoreboard · Home Assistant Native Add-on
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
    """

    plain_content = f"Prueba de Conexión Exitosa con Game Scoreboard.\nEnviado a {target} a las {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}."

    send_mime_message(
        recipients=[target],
        subject=subject,
        html_body=html_content,
        plain_body=plain_content,
        trigger_type="test",
        override_config=override_config
    )

    return {
        "status": "ok",
        "message": f"¡Correo de prueba enviado con éxito a {target}!",
        "recipient": target
    }


# -----------------------------------------------------------------------------
# TEMPLATES MANAGEMENT
# -----------------------------------------------------------------------------
def list_email_templates() -> List[Dict[str, Any]]:
    """List all email templates."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT id, name, subject_template, banner_url, intro_text,
           include_podium, include_standings, include_matches, include_metrics, footer_text, created_at
    FROM email_templates
    ORDER BY name ASC
    """)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


def get_email_template(template_id: str) -> Optional[Dict[str, Any]]:
    """Get single email template by id."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM email_templates WHERE id = ?", (template_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def update_email_template(template_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Update an existing email template."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM email_templates WHERE id = ?", (template_id,))
    if not cursor.fetchone():
        conn.close()
        raise ValueError(f"Plantilla '{template_id}' no encontrada.")

    cursor.execute("""
    UPDATE email_templates SET
        name = ?,
        subject_template = ?,
        banner_url = ?,
        intro_text = ?,
        include_podium = ?,
        include_standings = ?,
        include_matches = ?,
        include_metrics = ?,
        footer_text = ?
    WHERE id = ?
    """, (
        data.get("name"),
        data.get("subject_template"),
        data.get("banner_url", "static/img/email_banner.jpg"),
        data.get("intro_text", ""),
        1 if data.get("include_podium", True) else 0,
        1 if data.get("include_standings", True) else 0,
        1 if data.get("include_matches", True) else 0,
        1 if data.get("include_metrics", True) else 0,
        data.get("footer_text", ""),
        template_id
    ))
    conn.commit()
    conn.close()
    return get_email_template(template_id)


# -----------------------------------------------------------------------------
# AUTOMATIONS MANAGEMENT (CRUD)
# -----------------------------------------------------------------------------
def list_automations() -> List[Dict[str, Any]]:
    """List all automations."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT a.*, t.name AS template_name
    FROM automations a
    LEFT JOIN email_templates t ON a.template_id = t.id
    ORDER BY a.id ASC
    """)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


def get_automation(automation_id: int) -> Optional[Dict[str, Any]]:
    """Get single automation."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT a.*, t.name AS template_name
    FROM automations a
    LEFT JOIN email_templates t ON a.template_id = t.id
    WHERE a.id = ?
    """, (automation_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def create_automation(data: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new automation."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO automations (
        name, trigger_type, content_type, template_id, target_recipients, custom_emails, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        data.get("name", "Nueva Automatización"),
        data.get("trigger_type", "session_finished"),
        data.get("content_type", "session_summary"),
        data.get("template_id", "session_mario_kart"),
        data.get("target_recipients", "session_participants"),
        data.get("custom_emails", ""),
        1 if data.get("is_active", True) else 0
    ))
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return get_automation(new_id)


def update_automation(automation_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
    """Update an automation."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM automations WHERE id = ?", (automation_id,))
    if not cursor.fetchone():
        conn.close()
        raise ValueError("Automatización no encontrada")

    cursor.execute("""
    UPDATE automations SET
        name = ?,
        trigger_type = ?,
        content_type = ?,
        template_id = ?,
        target_recipients = ?,
        custom_emails = ?,
        is_active = ?
    WHERE id = ?
    """, (
        data.get("name"),
        data.get("trigger_type"),
        data.get("content_type"),
        data.get("template_id"),
        data.get("target_recipients"),
        data.get("custom_emails", ""),
        1 if data.get("is_active", True) else 0,
        automation_id
    ))
    conn.commit()
    conn.close()
    return get_automation(automation_id)


def toggle_automation(automation_id: int) -> Dict[str, Any]:
    """Toggle automation is_active status."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT is_active FROM automations WHERE id = ?", (automation_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise ValueError("Automatización no encontrada")
    new_status = 0 if row["is_active"] else 1
    cursor.execute("UPDATE automations SET is_active = ? WHERE id = ?", (new_status, automation_id))
    conn.commit()
    conn.close()
    return get_automation(automation_id)


def duplicate_automation(automation_id: int) -> Dict[str, Any]:
    """Duplicate/copy an existing automation."""
    existing = get_automation(automation_id)
    if not existing:
        raise ValueError("Automatización no encontrada")
    existing["name"] = f"{existing['name']} (Copia)"
    return create_automation(existing)


def delete_automation(automation_id: int):
    """Delete an automation."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM automations WHERE id = ?", (automation_id,))
    conn.commit()
    conn.close()


# -----------------------------------------------------------------------------
# AUTOMATION EXECUTION ENGINE
# -----------------------------------------------------------------------------
def execute_automation(automation: Dict[str, Any], context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Execute an automation, generating the appropriate template content and sending to target recipients.
    """
    if not automation.get("is_active"):
        return {"status": "inactive", "message": "Automation is deactivated"}

    template = get_email_template(automation.get("template_id", "session_mario_kart")) or {
        "name": "Plantilla General",
        "subject_template": "Reporte de Torneo: {{session_title}}",
        "banner_url": "static/img/email_banner.jpg",
        "intro_text": "Resultados oficiales:",
        "include_podium": 1,
        "include_standings": 1,
        "include_matches": 1,
        "include_metrics": 1,
        "footer_text": "Game Scoreboard"
    }

    content_type = automation.get("content_type", "session_summary")
    target_recipients = automation.get("target_recipients", "session_participants")

    # Determine recipients
    recipients = []
    if target_recipients == "session_participants":
        if context and "session" in context:
            recipients = [(p.get("email") or "").strip() for p in context["session"].get("players", []) if (p.get("email") or "").strip()]
    elif target_recipients == "all_players":
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT email FROM players WHERE email IS NOT NULL AND TRIM(email) != ''")
        recipients = [(r["email"] or "").strip() for r in cursor.fetchall() if (r["email"] or "").strip()]
        conn.close()
    elif target_recipients == "custom":
        raw = automation.get("custom_emails") or ""
        recipients = [e.strip() for e in raw.split(",") if "@" in e]

    if not recipients:
        return {"status": "skipped", "message": "No recipients found for automation"}

    # Render Subject & Body based on content_type
    subject = template.get("subject_template") or "Reporte de Game Scoreboard"
    month_name = datetime.now().strftime("%B %Y")

    if content_type == "session_summary" and context and "session" in context:
        s = context["session"]
        subject = subject.replace("{{session_title}}", s.get("title", "Sesión de Juego"))
        subject = subject.replace("{{game_name}}", s.get("game_name", "Videojuego"))
        subject = subject.replace("{{month}}", month_name)
        html_body, plain_body = render_session_email(s, template)
    elif content_type in ["global_leaderboard", "monthly_summary"]:
        subject = subject.replace("{{session_title}}", "Resumen General")
        subject = subject.replace("{{game_name}}", "Todos los juegos")
        subject = subject.replace("{{month}}", month_name)
        html_body, plain_body = render_global_digest_email(template, content_type)
    else:
        subject = subject.replace("{{session_title}}", "Notificación")
        subject = subject.replace("{{month}}", month_name)
        html_body = f"<p>{template.get('intro_text', 'Notificación de Game Scoreboard')}</p>"
        plain_body = template.get('intro_text', 'Notificación de Game Scoreboard')

    # Banner path
    banner_rel = (template.get("banner_url") or "static/img/banner_mario_kart.jpg").lstrip("/")
    banner_file = BASE_DIR / banner_rel
    if not banner_file.exists():
        if "mario" in str(template.get("id", "")).lower() and (BASE_DIR / "static/img/banner_mario_kart.jpg").exists():
            banner_file = BASE_DIR / "static/img/banner_mario_kart.jpg"
        else:
            banner_file = DEFAULT_BANNER_PATH

    result = send_mime_message(
        recipients=recipients,
        subject=subject,
        html_body=html_body,
        plain_body=plain_body,
        trigger_type=automation.get("trigger_type", "automation"),
        banner_file=banner_file
    )

    # Update last_triggered_at
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE automations SET last_triggered_at = CURRENT_TIMESTAMP WHERE id = ?", (automation["id"],))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[EmailService] Error updating last_triggered_at: {e}")

    return result


def trigger_session_finished_automations(session_id: int):
    """
    Trigger all active automations configured for 'session_finished'.
    """
    from routers.sessions import get_session
    try:
        session = get_session(session_id)
    except Exception as e:
        print(f"[EmailService] Could not load session {session_id}: {e}")
        return

    automations = list_automations()
    session_finished_autos = [a for a in automations if a.get("trigger_type") == "session_finished" and a.get("is_active")]

    for auto in session_finished_autos:
        try:
            execute_automation(auto, context={"session": session})
        except Exception as e:
            print(f"[EmailService] Error executing automation '{auto.get('name')}': {e}")


def format_rule_chip(k: str, v: Any) -> str:
    """Format game settings/rules into styled visual chips with relevant gaming icons."""
    k_lower = str(k).lower()
    v_str = str(v)
    accent = False
    icon = "⚙️"
    if "clase" in k_lower or "cc" in v_str.lower():
        icon = "⚡"
        accent = True
    elif "carrera" in k_lower or "vuelta" in k_lower:
        icon = "🏁"
        accent = True
    elif "vehiculo" in k_lower or "kart" in k_lower or "auto" in k_lower:
        icon = "🏎️"
    elif "cpu" in k_lower or "bot" in k_lower or "ia" in k_lower:
        icon = "🤖"
    elif "objeto" in k_lower or "item" in k_lower:
        icon = "🍌"
    elif "pista" in k_lower or "circuito" in k_lower or "map" in k_lower:
        icon = "🗺️"
    elif "equipo" in k_lower or "team" in k_lower:
        icon = "👥"

    bg = "rgba(99, 102, 241, 0.15)" if accent else "#131f3b"
    border = "rgba(99, 102, 241, 0.35)" if accent else "#1e293b"
    text_color = "#a5b4fc" if accent else "#94a3b8"

    return f'<span style="display: inline-block; background-color: {bg}; border: 1px solid {border}; border-radius: 6px; padding: 2px 7px; margin: 2px 3px; font-size: 10px; font-weight: 500; color: {text_color}; white-space: nowrap;">{icon} {v_str}</span>'


def render_session_email(session: Dict[str, Any], template: Dict[str, Any]) -> tuple:
    """Render HTML and plain text for session summary according to template flags."""
    standings_rows = ""
    podium_html = ""

    standings = session.get("standings", [])
    if template.get("include_podium") and len(standings) > 0:
        first = standings[0] if len(standings) > 0 else None
        second = standings[1] if len(standings) > 1 else None
        third = standings[2] if len(standings) > 2 else None

        p1_score = int(first["total_score"]) if first and first["total_score"] == int(first["total_score"]) else (first["total_score"] if first else 0)
        p2_score = int(second["total_score"]) if second and second["total_score"] == int(second["total_score"]) else (second["total_score"] if second else 0)
        p3_score = int(third["total_score"]) if third and third["total_score"] == int(third["total_score"]) else (third["total_score"] if third else 0)

        podium_html = f"""
        <div style="background-color: #090d16; border: 1px solid #1e293b; border-radius: 14px; padding: 16px; margin-bottom: 20px; text-align: center;">
          <h4 style="color: #fbbf24; font-size: 13px; text-transform: uppercase; margin: 0 0 12px 0;">👑 Podio de Honor 👑</h4>
          <table border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="width: 33%; text-align: center; vertical-align: bottom; padding: 8px;">
                {f'<div style="font-size: 20px;">🥈</div><strong style="color: #cbd5e1; font-size: 13px; display: block;">{second["name"]}</strong><span style="color: #94a3b8; font-size: 11px;">{p2_score} pts</span>' if second else ''}
              </td>
              <td style="width: 34%; text-align: center; vertical-align: bottom; padding: 8px; border-left: 1px solid #1e293b; border-right: 1px solid #1e293b;">
                {f'<div style="font-size: 28px;">🥇</div><strong style="color: #fbbf24; font-size: 15px; display: block;">{first["name"]}</strong><span style="color: #fde68a; font-size: 12px; font-weight: bold;">{p1_score} pts ({first["wins"]} vic.)</span>' if first else ''}
              </td>
              <td style="width: 33%; text-align: center; vertical-align: bottom; padding: 8px;">
                {f'<div style="font-size: 20px;">🥉</div><strong style="color: #d97706; font-size: 13px; display: block;">{third["name"]}</strong><span style="color: #94a3b8; font-size: 11px;">{p3_score} pts</span>' if third else ''}
              </td>
            </tr>
          </table>
        </div>
        """

    if template.get("include_standings"):
        for idx, st in enumerate(standings, start=1):
            medal = "🥇" if idx == 1 else ("🥈" if idx == 2 else ("🥉" if idx == 3 else f"{idx}º"))
            st_score = int(st["total_score"]) if st["total_score"] == int(st["total_score"]) else st["total_score"]
            standings_rows += f"""
            <tr style="border-bottom: 1px solid #1e293b;">
              <td style="padding: 10px 12px; font-weight: bold; font-size: 14px; text-align: center; color: #fbbf24;">{medal}</td>
              <td style="padding: 10px 12px;">
                <strong style="color: #ffffff; font-size: 13px;">{st['name']}</strong>
                <span style="color: #818cf8; font-size: 11px; margin-left: 4px;">@{st.get('nickname') or ''}</span>
              </td>
              <td style="padding: 10px 12px; text-align: center; color: #10b981; font-weight: bold;">{st['wins']}</td>
              <td style="padding: 10px 12px; text-align: center; color: #94a3b8;">{st['matches_played']}</td>
              <td style="padding: 10px 12px; text-align: right; color: #fbbf24; font-weight: 800; font-size: 15px;">{st_score} pts</td>
            </tr>
            """

    matches_html = ""
    if template.get("include_matches"):
        for m in session.get("matches", []):
            is_practice = bool(m.get("is_practice"))
            type_badge = "Práctica" if is_practice else "Oficial"
            badge_style = "background-color: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.35); color: #fbbf24;" if is_practice else "background-color: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.35); color: #34d399;"

            # Visual chips for rules
            rule_chips = []
            for k, v in m.get("rule_values", {}).items():
                if v:
                    rule_chips.append(format_rule_chip(k, v))
            rules_html = f'<div style="padding: 8px 12px 10px 12px; background-color: #0b1329;">{" ".join(rule_chips)}</div>' if rule_chips else ""

            # Player scores mini-table
            scores_rows_html = ""
            for sc in m.get("scores", []):
                rank = sc.get("rank_position", 1)
                medal = "🥇" if rank == 1 else ("🥈" if rank == 2 else ("🥉" if rank == 3 else f"{rank}º"))

                sc_val = sc.get("score", 0)
                formatted_score = int(sc_val) if sc_val == int(sc_val) else sc_val

                # Character / Kart badge
                char_badge = ""
                if template.get("include_metrics") and sc.get("metrics"):
                    char_name = sc["metrics"].get("character")
                    kart_name = sc["metrics"].get("kart")
                    if char_name:
                        char_text = f"🏎️ {char_name}" + (f" · {kart_name}" if kart_name else "")
                        char_badge = f'<span style="display: inline-block; margin-left: 8px; background-color: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 6px; padding: 2px 7px; font-size: 11px; font-weight: 600; color: #a5b4fc;">{char_text}</span>'

                nick_str = f'<span style="color: #64748b; font-size: 11px; margin-left: 4px;">@{sc["player_nickname"]}</span>' if sc.get("player_nickname") else ""
                rank_color = "#fbbf24" if rank == 1 else ("#cbd5e1" if rank == 2 else ("#d97706" if rank == 3 else "#94a3b8"))
                score_color = "#fbbf24" if rank == 1 else "#f8fafc"
                row_bg = "background-color: rgba(251, 191, 36, 0.04);" if rank == 1 else ""

                scores_rows_html += f"""
                <tr style="border-top: 1px solid #14203d; {row_bg}">
                  <td style="padding: 9px 12px; width: 44px; text-align: center; font-weight: bold; font-size: {'15px' if rank <= 3 else '12px'}; color: {rank_color};">
                    {medal}
                  </td>
                  <td style="padding: 9px 8px; text-align: left;">
                    <strong style="color: #ffffff; font-size: 13px;">{sc['player_name']}</strong>
                    {nick_str}
                    {char_badge}
                  </td>
                  <td style="padding: 9px 14px; text-align: right; width: 90px;">
                    <strong style="color: {score_color}; font-size: 13px; font-weight: 800;">{formatted_score}</strong>
                    <span style="color: #64748b; font-size: 10px;">pts</span>
                  </td>
                </tr>
                """

            matches_html += f"""
            <div style="background-color: #0b1329; border: 1px solid #1e293b; border-radius: 14px; margin-bottom: 14px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.25);">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0f1b38; border-bottom: 1px solid #1e293b;">
                <tr>
                  <td style="padding: 10px 14px;">
                    <span style="color: #ffffff; font-weight: 800; font-size: 13px;">🏁 Partida #{m['match_number']}</span>
                    <span style="color: #818cf8; font-size: 11px; margin-left: 6px;">({m.get('match_type', 'Partida')})</span>
                  </td>
                  <td style="padding: 10px 14px; text-align: right;">
                    <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 700; text-transform: uppercase; {badge_style}">
                      {type_badge}
                    </span>
                  </td>
                </tr>
              </table>
              {rules_html}
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tbody>
                  {scores_rows_html}
                </tbody>
              </table>
            </div>
            """

    html = f"""
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>{session['title']}</title>
    </head>
    <body style="margin: 0; padding: 20px; background-color: #020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
        <tr>
          <td style="padding: 0; text-align: center; background-color: #090d16;">
            <img src="cid:tournament_banner" alt="Game Scoreboard" width="600" style="width: 100%; max-width: 600px; height: auto; display: block; border-top-left-radius: 20px; border-top-right-radius: 20px; margin: 0 auto;" />
          </td>
        </tr>
        <tr>
          <td style="padding: 24px;">
            <div style="color: #818cf8; font-size: 12px; font-weight: bold; text-transform: uppercase; margin-bottom: 4px;">
              {session.get('game_icon', '🎮')} {session.get('game_name', 'Videojuego')}
            </div>
            <h1 style="color: #ffffff; font-size: 22px; font-weight: 800; margin: 0 0 6px 0;">
              {session['title']}
            </h1>
            <p style="color: #94a3b8; font-size: 13px; line-height: 1.5; margin: 0 0 18px 0;">
              {template.get('intro_text', 'Resultados oficiales de la sesión:')}
            </p>

            {podium_html}

            {f'''
            <div style="background-color: #090d16; border: 1px solid #1e293b; border-radius: 14px; padding: 14px; margin-bottom: 20px;">
              <h3 style="color: #e2e8f0; font-size: 12px; text-transform: uppercase; margin: 0 0 10px 0;">📊 Tabla de Puntuaciones</h3>
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <thead>
                  <tr style="border-bottom: 1px solid #1e293b; color: #64748b; font-size: 11px; text-transform: uppercase;">
                    <th style="padding: 6px 12px; text-align: center; width: 40px;">Pos</th>
                    <th style="padding: 6px 12px; text-align: left;">Jugador</th>
                    <th style="padding: 6px 12px; text-align: center;">Vic</th>
                    <th style="padding: 6px 12px; text-align: center;">Partidas</th>
                    <th style="padding: 6px 12px; text-align: right;">Puntos</th>
                  </tr>
                </thead>
                <tbody>
                  {standings_rows}
                </tbody>
              </table>
            </div>
            ''' if template.get("include_standings") else ''}

            {f'''
            <h3 style="color: #e2e8f0; font-size: 12px; text-transform: uppercase; margin: 0 0 10px 0;">📜 Historial de Partidas</h3>
            {matches_html}
            ''' if template.get("include_matches") and matches_html else ''}

            <p style="color: #64748b; font-size: 11px; text-align: center; margin: 24px 0 0 0; border-top: 1px solid #1e293b; padding-top: 14px;">
              {template.get('footer_text', 'Game Scoreboard · Home Assistant Add-on')}
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
    """

    plain = f"Resultados de Sesión: {session['title']}\n" + "\n".join([f"{st['name']}: {st['total_score']} pts ({st['wins']} vic)" for st in standings])
    return html, plain


def render_global_digest_email(template: Dict[str, Any], content_type: str) -> tuple:
    """Render global leaderboard or monthly digest."""
    from routers.stats import get_leaderboard
    lb = get_leaderboard(include_practice=False)

    rows_html = ""
    for idx, p in enumerate(lb, start=1):
        medal = "🥇" if idx == 1 else ("🥈" if idx == 2 else ("🥉" if idx == 3 else f"{idx}º"))
        rows_html += f"""
        <tr style="border-bottom: 1px solid #1e293b;">
          <td style="padding: 8px 12px; text-align: center; font-weight: bold; color: #fbbf24;">{medal}</td>
          <td style="padding: 8px 12px; color: #ffffff; font-size: 13px;"><strong>{p['name']}</strong> (@{p.get('nickname') or ''})</td>
          <td style="padding: 8px 12px; text-align: center; color: #10b981; font-weight: bold;">{p['wins']}</td>
          <td style="padding: 8px 12px; text-align: center; color: #94a3b8;">{p['matches_played']}</td>
          <td style="padding: 8px 12px; text-align: center; color: #f59e0b;">{p['win_rate']}%</td>
          <td style="padding: 8px 12px; text-align: right; color: #fbbf24; font-weight: bold;">{p['total_score']} pts</td>
        </tr>
        """

    title = "Resumen Mensual de Campeonatos" if content_type == "monthly_summary" else "Leaderboard Global"
    html = f"""
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>{title}</title>
    </head>
    <body style="margin: 0; padding: 20px; background-color: #020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
        <tr>
          <td style="padding: 0; text-align: center; background-color: #090d16;">
            <img src="cid:tournament_banner" alt="Game Scoreboard" width="600" style="width: 100%; max-width: 600px; height: auto; display: block; border-top-left-radius: 20px; border-top-right-radius: 20px; margin: 0 auto;" />
          </td>
        </tr>
        <tr>
          <td style="padding: 24px;">
            <h1 style="color: #ffffff; font-size: 22px; font-weight: 800; margin: 0 0 8px 0;">{title}</h1>
            <p style="color: #94a3b8; font-size: 13px; margin: 0 0 18px 0;">{template.get('intro_text', 'Estado del campeonato global:')}</p>

            <div style="background-color: #090d16; border: 1px solid #1e293b; border-radius: 14px; padding: 14px; margin-bottom: 20px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <thead>
                  <tr style="border-bottom: 1px solid #1e293b; color: #64748b; font-size: 11px; text-transform: uppercase;">
                    <th style="padding: 6px 12px; text-align: center;">Pos</th>
                    <th style="padding: 6px 12px; text-align: left;">Jugador</th>
                    <th style="padding: 6px 12px; text-align: center;">Vic</th>
                    <th style="padding: 6px 12px; text-align: center;">Partidas</th>
                    <th style="padding: 6px 12px; text-align: center;">Win%</th>
                    <th style="padding: 6px 12px; text-align: right;">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {rows_html}
                </tbody>
              </table>
            </div>

            <p style="color: #64748b; font-size: 11px; text-align: center; margin: 24px 0 0 0; border-top: 1px solid #1e293b; padding-top: 14px;">
              {template.get('footer_text', 'Game Scoreboard · Home Assistant Add-on')}
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
    """

    plain = f"{title}\n" + "\n".join([f"{p['name']}: {p['wins']} vic, {p['total_score']} pts" for p in lb])
    return html, plain
