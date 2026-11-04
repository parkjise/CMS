"""슈퍼 어드민 2FA 초기화 — 인증 앱을 잃었을 때 서버에서만 실행 (T-136).

python scripts/reset_super_2fa.py <이메일>
다음 로그인 때 인증 앱을 새로 등록한다 (SUPER_ADMIN_REQUIRE_2FA=true 일 때).
"""

import asyncio
import sys

from app.db.session import AsyncSessionLocal
from app.services.auth import reset_totp


async def main(email: str) -> int:
    async with AsyncSessionLocal() as db:
        if not await reset_totp(db, email):
            print(f"슈퍼 어드민 계정을 찾지 못했습니다: {email}")
            return 1
    print(f"2FA 를 초기화했습니다: {email}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(asyncio.run(main(sys.argv[1])))
