from fastapi import APIRouter

# 각 Phase에서 엔드포인트가 추가되면 여기에 include_router 추가
# from app.api.v1.endpoints import auth, sections, inquiries, upload, ...

api_router = APIRouter()

# 헬스체크 (인증 불필요)
@api_router.get("/health", tags=["system"])
async def health():
    return {"status": "ok"}
