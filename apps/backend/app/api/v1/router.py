from fastapi import APIRouter, Depends

from app.api.v1.endpoints import (
    ai,
    analytics,
    announcements,
    auth,
    billing,
    dashboard,
    domain,
    edit,
    gallery,
    inquiries,
    notification_settings,
    notifications,
    sections,
    seo,
    sns,
    templates,
    tenant_features,
    upload,
)
from app.core.deps import get_tenant_id

api_router = APIRouter()

# 테넌트 관리자 API 는 테넌트 계정만 (T-082-B) — 슈퍼 어드민 토큰(tenant_id 없음)은 403.
# 전에는 RLS 를 우회한 채 들어와 모든 테넌트 행이 섞여 500 (SNS · SEO 조회) 이 났다.
# 새 라우터도 이 목록에 넣으면 자동 적용. 예외: auth(로그인 자체),
# notifications(EventSource 라 ?token= 으로 직접 확인)
_tenant_only = [Depends(get_tenant_id)]

api_router.include_router(auth.router)
api_router.include_router(notifications.router)
api_router.include_router(sections.router, dependencies=_tenant_only)
api_router.include_router(inquiries.router, dependencies=_tenant_only)
api_router.include_router(sns.router, dependencies=_tenant_only)
api_router.include_router(seo.router, dependencies=_tenant_only)
api_router.include_router(dashboard.router, dependencies=_tenant_only)
api_router.include_router(notification_settings.router, dependencies=_tenant_only)
api_router.include_router(edit.router, dependencies=_tenant_only)
api_router.include_router(analytics.router, dependencies=_tenant_only)
api_router.include_router(upload.router, dependencies=_tenant_only)
api_router.include_router(gallery.router, dependencies=_tenant_only)
api_router.include_router(ai.router, dependencies=_tenant_only)
api_router.include_router(templates.router, dependencies=_tenant_only)
api_router.include_router(tenant_features.router, dependencies=_tenant_only)
api_router.include_router(announcements.router, dependencies=_tenant_only)
api_router.include_router(billing.router, dependencies=_tenant_only)
api_router.include_router(domain.router, dependencies=_tenant_only)


# 헬스체크 (인증 불필요)
@api_router.get("/health", tags=["system"])
async def health():
    return {"status": "ok"}
