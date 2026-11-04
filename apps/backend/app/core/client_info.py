"""요청을 보낸 방문자 정보 — 문의 스팸 판단용 (T-128)."""

from ipaddress import ip_address

from fastapi import Request

USER_AGENT_MAX_LEN = 500


def client_ip(request: Request) -> str | None:
    """방문자 IP — Nginx 가 덮어쓰는 X-Real-IP 를 쓴다 (nginx/nginx.conf).

    X-Forwarded-For 는 방문자가 보낸 값이 앞에 남아 있어 위조할 수 있다.
    """
    raw = request.headers.get("X-Real-IP") or (
        request.client.host if request.client else None
    )
    if not raw:
        return None
    try:
        return str(ip_address(raw.strip()))
    except ValueError:
        return None


def client_user_agent(request: Request) -> str | None:
    return request.headers.get("User-Agent", "")[:USER_AGENT_MAX_LEN] or None
