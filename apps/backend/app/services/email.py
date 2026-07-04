"""T-098 이메일 발송 서비스 (AWS SES + Jinja2).

test 모드(`settings.email_mode != "live"`)에서는 SES 호출 없이 결정적 stub을
반환한다. 실제 발송은 live 모드에서만 일어난다. 온보딩/영수증/만료/해지 등
7종 시나리오 헬퍼를 제공한다.
"""

import asyncio
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.core.config import settings

_TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates" / "email"

_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATE_DIR)),
    autoescape=select_autoescape(["html", "j2"]),
)


def _is_live() -> bool:
    return settings.email_mode == "live"


def render_email(template: str, variables: dict[str, Any]) -> str:
    """Jinja2 템플릿 렌더링. `template`은 확장자 없는 이름."""
    tpl = _env.get_template(f"{template}.html.j2")
    return tpl.render(**variables)


async def send_email(
    to: str, subject: str, template: str, variables: dict[str, Any]
) -> dict:
    """기본 발송 함수. test 모드에서는 SES 호출 없이 stub 반환."""
    html = render_email(template, variables)

    if not _is_live():
        return {"sent": True, "stub": True, "to": to, "subject": subject}

    def _send_ses() -> dict:
        import boto3

        client = boto3.client(
            "ses",
            region_name=settings.aws_ses_region,
            aws_access_key_id=settings.aws_access_key_id or None,
            aws_secret_access_key=settings.aws_secret_access_key or None,
        )
        resp = client.send_email(
            Source=settings.aws_ses_from_email,
            Destination={"ToAddresses": [to]},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {"Html": {"Data": html, "Charset": "UTF-8"}},
            },
        )
        return {"sent": True, "stub": False, "message_id": resp.get("MessageId")}

    return await asyncio.to_thread(_send_ses)


# ── 시나리오별 헬퍼 (기획서 15.4) ──────────────────────────────────────────
async def send_welcome_email(
    to: str, *, tenant_name: str, admin_email: str, temp_password: str, plan_type: str
) -> dict:
    return await send_email(
        to,
        subject=f"[CMS] {tenant_name}님, 환영합니다 🎉",
        template="welcome",
        variables={
            "tenant_name": tenant_name,
            "admin_url": settings.admin_base_url,
            "admin_email": admin_email,
            "temp_password": temp_password,
            "plan_type": plan_type,
        },
    )


async def send_domain_activated(to: str, *, tenant_name: str, domain: str) -> dict:
    return await send_email(
        to,
        subject="[CMS] 도메인 연결이 완료되었습니다",
        template="domain_activated",
        variables={"tenant_name": tenant_name, "domain": domain},
    )


async def send_payment_receipt(
    to: str,
    *,
    tenant_name: str,
    plan_type: str,
    order_id: str,
    amount: int,
    paid_at: str,
    receipt_url: str | None = None,
) -> dict:
    return await send_email(
        to,
        subject="[CMS] 결제 영수증",
        template="payment_receipt",
        variables={
            "tenant_name": tenant_name,
            "plan_type": plan_type,
            "order_id": order_id,
            "amount": f"{amount:,}",
            "paid_at": paid_at,
            "receipt_url": receipt_url,
        },
    )


async def send_payment_failed(to: str, *, tenant_name: str, attempt_count: int) -> dict:
    return await send_email(
        to,
        subject="[CMS] 결제에 실패했습니다 — 카드 확인 요청",
        template="payment_failed",
        variables={
            "tenant_name": tenant_name,
            "attempt_count": attempt_count,
            "billing_url": f"{settings.admin_base_url}/billing",
        },
    )


async def send_expiring_notice(to: str, *, tenant_name: str, days_left: int) -> dict:
    return await send_email(
        to,
        subject=f"[CMS] 구독이 {days_left}일 후 만료됩니다",
        template="expiring_notice",
        variables={
            "tenant_name": tenant_name,
            "days_left": days_left,
            "billing_url": f"{settings.admin_base_url}/billing",
        },
    )


async def send_cancellation_confirmed(to: str, *, tenant_name: str) -> dict:
    return await send_email(
        to,
        subject="[CMS] 구독 해지가 완료되었습니다",
        template="cancellation_confirmed",
        variables={"tenant_name": tenant_name},
    )


async def send_data_deleted(to: str) -> dict:
    return await send_email(
        to,
        subject="[CMS] 데이터 삭제 완료 안내",
        template="data_deleted",
        variables={},
    )
