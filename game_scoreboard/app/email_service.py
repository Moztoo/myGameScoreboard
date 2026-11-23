import os
import json
import smtplib
from pathlib import Path
from typing import Dict, Any, List, Optional
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage

from database import DATA_DIR, BASE_DIR, get_db_connection

EMAIL_CONFIG_FILE = DATA_DIR / "email_config.json"
BANNER_IMAGE_PATH = BASE_DIR / "static" / "img" / "email_banner.jpg"


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
    
    # Don't overwrite password with masked value if user didn't change it
    new_pw = (config.get("smtp_password") or "").strip()
    if not new_pw or new_pw == "********":
        config["smtp_password"] = existing.get("smtp_password", "")
    else:
        # Strip spaces (Google app passwords often come with spaces like 'abcd efgh ijkl mnop')
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


def send_test_email(override_config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Send a test email ONLY to players that have an email registered.
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
        raise ValueError("Configuración incompleta: Ingresa el correo remitente y la contraseña de aplicación de Google.")

    # 1. Fetch only players with registered email
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT id, name, nickname, email, color_hex
    FROM players
    WHERE email IS NOT NULL AND TRIM(email) != ''
    ORDER BY name ASC
    """)
    players_with_email = [dict(r) for r in cursor.fetchall()]
    conn.close()

    if not players_with_email:
        raise ValueError("No se encontraron jugadores con correo registrado. Agrega o edita el perfil de al menos un jugador en la pestaña 'Jugadores'.")

    recipients = [(p.get("email") or "").strip() for p in players_with_email if (p.get("email") or "").strip()]

    # 2. Build HTML Body
    players_list_html = "".join([
        f"""
        <tr style="border-bottom: 1px solid #1e293b;">
          <td style="padding: 10px 12px; display: flex; align-items: center;">
            <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: {p.get('color_hex', '#6366f1')}; margin-right: 8px;"></span>
            <strong style="color: #ffffff; font-size: 14px;">{p['name']}</strong>
            <span style="color: #818cf8; font-size: 12px; margin-left: 6px;">@{p.get('nickname') or 'player'}</span>
          </td>
          <td style="padding: 10px 12px; text-align: right; color: #94a3b8; font-size: 13px;">
            {p['email']}
          </td>
        </tr>
        """
        for p in players_with_email
    ])

    html_content = f"""
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Game Scoreboard - Prueba Exitosa</title>
    </head>
    <body style="margin: 0; padding: 20px; background-color: #020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
        <!-- Banner Header -->
        <tr>
          <td style="padding: 0; text-align: center; background-color: #090d16;">
            <img src="cid:tournament_banner" alt="Game Scoreboard" style="width: 100%; max-width: 600px; height: auto; display: block;" />
          </td>
        </tr>

        <!-- Content -->
        <tr>
          <td style="padding: 28px 24px;">
            <div style="background-color: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 12px; padding: 8px 14px; display: inline-block; margin-bottom: 16px;">
              <span style="color: #818cf8; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">⚡ Prueba de Conexión</span>
            </div>

            <h1 style="color: #ffffff; font-size: 22px; font-weight: 800; margin: 0 0 10px 0; line-height: 1.3;">
              ¡Tu servidor de Scoreboard está conectado! 🏁
            </h1>
            <p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
              Este es un correo de prueba enviado desde tu complemento de <strong>Home Assistant</strong>. Tu configuración SMTP ha sido verificada con éxito.
            </p>

            <!-- Recipients Box -->
            <div style="background-color: #090d16; border: 1px solid #1e293b; border-radius: 14px; padding: 16px; margin-bottom: 24px;">
              <h3 style="color: #e2e8f0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 12px 0;">
                👥 Jugadores Registrados para Recibir Reportes ({len(players_with_email)})
              </h3>
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                {players_list_html}
              </table>
            </div>

            <!-- Feature highlight -->
            <div style="background-color: rgba(245, 158, 11, 0.08); border-left: 4px solid #f59e0b; border-radius: 0 12px 12px 0; padding: 14px 16px; margin-bottom: 24px;">
              <h4 style="color: #fbbf24; font-size: 13px; margin: 0 0 4px 0; font-weight: 700;">
                🏆 ¿Qué pasará ahora al terminar una partida?
              </h4>
              <p style="color: #cbd5e1; font-size: 12px; line-height: 1.5; margin: 0;">
                Cada vez que pulses <strong>"Finalizar Sesión"</strong> en tu Scoreboard, todos los jugadores que hayan participado recibirán automáticamente su reporte con el podio (🥇🥈🥉), puntuaciones y desglose de carreras.
              </p>
            </div>

            <!-- Footer -->
            <p style="color: #64748b; font-size: 11px; text-align: center; margin: 24px 0 0 0; border-top: 1px solid #1e293b; padding-top: 16px;">
              Enviado automáticamente por <strong>Game Scoreboard</strong> · Home Assistant Native Add-on<br>
              Host: {smtp_host} · Remitente: {sender_email}
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
    """

    plain_content = f"""
    ¡Tu servidor de Game Scoreboard está conectado!
    ================================================
    Este es un correo de prueba de tu Home Assistant Add-on.

    Jugadores que recibirán reportes ({len(players_with_email)}):
    """ + "\n".join([f"- {p['name']} (@{p.get('nickname') or ''}): {p['email']}" for p in players_with_email])

    # 3. Create MIME Message
    msg_root = MIMEMultipart("related")
    msg_root["Subject"] = "🎮 Game Scoreboard: Prueba de Conexión Exitosa 🏁"
    msg_root["From"] = f"{sender_name} <{sender_email}>"
    msg_root["To"] = ", ".join(recipients)

    msg_alternative = MIMEMultipart("alternative")
    msg_root.attach(msg_alternative)

    msg_alternative.attach(MIMEText(plain_content, "plain", "utf-8"))
    msg_alternative.attach(MIMEText(html_content, "html", "utf-8"))

    # Attach inline banner
    if BANNER_IMAGE_PATH.exists():
        with open(BANNER_IMAGE_PATH, "rb") as img_f:
            img_part = MIMEImage(img_f.read(), _subtype="jpeg")
            img_part.add_header("Content-ID", "<tournament_banner>")
            img_part.add_header("Content-Disposition", "inline", filename="banner.jpg")
            msg_root.attach(img_part)

    # 4. Connect to SMTP server & send
    server = smtplib.SMTP(smtp_host, smtp_port, timeout=12)
    if use_tls:
        server.starttls()
    server.login(sender_email, smtp_password)
    server.sendmail(sender_email, recipients, msg_root.as_string())
    server.quit()

    return {
        "status": "ok",
        "message": f"¡Correo de prueba enviado con éxito a {len(recipients)} jugador(es)!",
        "recipients": recipients
    }


def send_session_report_email(session_id: int) -> Dict[str, Any]:
    """
    Send complete tournament session report to all participating players with registered email.
    """
    cfg = get_email_config()
    if not cfg.get("is_enabled", True):
        return {"status": "disabled", "message": "Email notifications are disabled."}

    sender_email = (cfg.get("sender_email") or "").strip()
    smtp_password = (cfg.get("smtp_password") or "").strip()
    smtp_host = (cfg.get("smtp_host") or "smtp.gmail.com").strip()
    smtp_port = int(cfg.get("smtp_port") or 587)
    sender_name = cfg.get("sender_name") or "Game Scoreboard 🎮"
    use_tls = cfg.get("use_tls", True)

    if not sender_email or not smtp_password:
        return {"status": "error", "message": "SMTP not configured"}

    # Fetch session details
    from routers.sessions import get_session
    try:
        session = get_session(session_id)
    except Exception as e:
        return {"status": "error", "message": str(e)}

    # Filter players with email
    participating_with_email = [p for p in session["players"] if (p.get("email") or "").strip()]
    if not participating_with_email:
        return {"status": "skipped", "message": "No participating players have an email"}

    recipients = [(p.get("email") or "").strip() for p in participating_with_email]

    # Build Standings Table HTML
    standings_rows = ""
    for idx, st in enumerate(session.get("standings", []), start=1):
        medal = "🥇" if idx == 1 else ("🥈" if idx == 2 else ("🥉" if idx == 3 else f"{idx}º"))
        standings_rows += f"""
        <tr style="border-bottom: 1px solid #1e293b;">
          <td style="padding: 10px 12px; font-weight: bold; font-size: 14px; text-align: center; color: #fbbf24;">{medal}</td>
          <td style="padding: 10px 12px;">
            <strong style="color: #ffffff; font-size: 13px;">{st['name']}</strong>
            <span style="color: #818cf8; font-size: 11px; margin-left: 4px;">@{st.get('nickname') or ''}</span>
          </td>
          <td style="padding: 10px 12px; text-align: center; color: #10b981; font-weight: bold;">{st['wins']}</td>
          <td style="padding: 10px 12px; text-align: center; color: #94a3b8;">{st['matches_played']}</td>
          <td style="padding: 10px 12px; text-align: right; color: #fbbf24; font-weight: 800; font-size: 15px;">{st['total_score']} pts</td>
        </tr>
        """

    # Build Matches list HTML
    matches_html = ""
    for m in session.get("matches", []):
        type_badge = "Práctica" if m.get("is_practice") else "Oficial"
        scores_line = ", ".join([f"<strong>{sc['player_nickname'] or sc['player_name']}</strong> ({sc['rank_position']}º · {sc['score']} pts)" for sc in m.get("scores", [])])
        rules_line = " · ".join([f"{k}: {v}" for k, v in m.get("rule_values", {}).items()])
        matches_html += f"""
        <div style="background-color: #090d16; border: 1px solid #1e293b; border-radius: 12px; padding: 12px 14px; margin-bottom: 10px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <span style="color: #818cf8; font-weight: bold; font-size: 12px;">Partida #{m['match_number']} ({m['match_type']}) [{type_badge}]</span>
          </div>
          {f'<div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px;">{rules_line}</div>' if rules_line else ''}
          <div style="color: #e2e8f0; font-size: 12px;">{scores_line}</div>
        </div>
        """

    html_content = f"""
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Resultados de Sesión - {session['title']}</title>
    </head>
    <body style="margin: 0; padding: 20px; background-color: #020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
        <tr>
          <td style="padding: 0; text-align: center; background-color: #090d16;">
            <img src="cid:tournament_banner" alt="Game Scoreboard" style="width: 100%; max-width: 600px; height: auto; display: block;" />
          </td>
        </tr>
        <tr>
          <td style="padding: 28px 24px;">
            <div style="color: #818cf8; font-size: 12px; font-weight: bold; text-transform: uppercase; margin-bottom: 4px;">
              {session.get('game_icon', '🎮')} {session.get('game_name', 'Videojuego')}
            </div>
            <h1 style="color: #ffffff; font-size: 22px; font-weight: 800; margin: 0 0 8px 0;">
              {session['title']}
            </h1>
            <p style="color: #94a3b8; font-size: 12px; margin: 0 0 20px 0;">
              Sesión completada el {session.get('ended_at', session.get('started_at'))} · {len(session.get('matches', []))} partidas
            </p>

            <!-- Leaderboard Standings Table -->
            <div style="background-color: #090d16; border: 1px solid #1e293b; border-radius: 14px; padding: 14px; margin-bottom: 24px;">
              <h3 style="color: #e2e8f0; font-size: 13px; text-transform: uppercase; margin: 0 0 10px 0;">
                📊 Tabla de Posiciones Final
              </h3>
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <thead>
                  <tr style="border-bottom: 1px solid #1e293b; color: #64748b; font-size: 11px; text-transform: uppercase;">
                    <th style="padding: 6px 12px; text-align: center; width: 40px;">Pos</th>
                    <th style="padding: 6px 12px; text-align: left;">Jugador</th>
                    <th style="padding: 6px 12px; text-align: center;">Victorias</th>
                    <th style="padding: 6px 12px; text-align: center;">Partidas</th>
                    <th style="padding: 6px 12px; text-align: right;">Puntos</th>
                  </tr>
                </thead>
                <tbody>
                  {standings_rows}
                </tbody>
              </table>
            </div>

            <!-- Matches History -->
            <h3 style="color: #e2e8f0; font-size: 13px; text-transform: uppercase; margin: 0 0 10px 0;">
              📜 Detalle de Partidas
            </h3>
            {matches_html}

            <!-- Footer -->
            <p style="color: #64748b; font-size: 11px; text-align: center; margin: 24px 0 0 0; border-top: 1px solid #1e293b; padding-top: 16px;">
              Enviado automáticamente por <strong>Game Scoreboard</strong> · Home Assistant Native Add-on
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
    """

    msg_root = MIMEMultipart("related")
    msg_root["Subject"] = f"🏆 Resultados: {session['title']} ({session.get('game_name', 'Torneo')}) 🏁"
    msg_root["From"] = f"{sender_name} <{sender_email}>"
    msg_root["To"] = ", ".join(recipients)

    msg_alternative = MIMEMultipart("alternative")
    msg_root.attach(msg_alternative)
    msg_alternative.attach(MIMEText(html_content, "html", "utf-8"))

    if BANNER_IMAGE_PATH.exists():
        with open(BANNER_IMAGE_PATH, "rb") as img_f:
            img_part = MIMEImage(img_f.read(), _subtype="jpeg")
            img_part.add_header("Content-ID", "<tournament_banner>")
            img_part.add_header("Content-Disposition", "inline", filename="banner.jpg")
            msg_root.attach(img_part)

    server = smtplib.SMTP(smtp_host, smtp_port, timeout=12)
    if use_tls:
        server.starttls()
    server.login(sender_email, smtp_password)
    server.sendmail(sender_email, recipients, msg_root.as_string())
    server.quit()

    return {"status": "ok", "recipients": recipients}
