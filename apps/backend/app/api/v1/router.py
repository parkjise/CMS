from fastapi import APIRouter

from app.api.v1.endpoints import auth, inquiries, sections, seo, sns

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(sections.router)
api_router.include_router(inquiries.router)
api_router.include_router(sns.router)
api_router.include_router(seo.router)

# 헬스체크 (인증 불필요)
@api_router.get("/health", tags=["system"])
async def health():
    return {"status": "ok"}
