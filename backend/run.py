import os

import uvicorn

# ASGI-приложение: корневой `main.py` реэкспортирует `app` из `app.main` (см. backend/main.py).
def _listen_port() -> int:
    raw = os.environ.get("PORT", "8080").strip()
    try:
        p = int(raw)
        if 1 <= p <= 65535:
            return p
    except ValueError:
        pass
    return 8080


if __name__ == "__main__":
    port = _listen_port()
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        log_level="info",
        # За reverse-proxy Railway (X-Forwarded-Proto / Host)
        proxy_headers=True,
        forwarded_allow_ips="*",
    )
