import os
import uvicorn

from app.main import app


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
        app,
        host="0.0.0.0",
        port=port,
        log_level="info",
    )