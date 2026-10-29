"""사업체 공통 정보 (T-036-A, 기획서 AD-02-A 공통 설정)."""

from httpx import AsyncClient

from tests.test_rls import tenant_b, tenant_b_headers  # noqa: F401 (픽스처)

_URL = "/api/v1/site-settings"

_FULL = {
    "phone": "02-1234-5678",
    "email": "hello@clinic.kr",
    "address": "서울특별시 강남구 테헤란로 1",
    "address_detail": "3층",
    "hours_weekday": "09:00 - 18:00",
    "hours_saturday": "09:00 - 13:00",
    "hours_note": "일요일 · 공휴일 휴무",
    "parking": "건물 지하 2시간 무료",
    "ceo": "홍길동",
    "business_number": "1234567890",
    "logo_url": "https://cdn.example.com/logo.webp",
    "favicon_url": "https://cdn.example.com/favicon.webp",
}


class TestSiteSettingsApi:
    async def test_get_empty(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get(_URL, headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["data"] is None

    async def test_unauthenticated(self, client: AsyncClient):
        assert (await client.get(_URL)).status_code == 401
        assert (
            await client.put(_URL, json={"phone": "02-1234-5678"})
        ).status_code == 401

    async def test_save_and_normalize(self, client: AsyncClient, auth_headers: dict):
        resp = await client.put(_URL, json=_FULL, headers=auth_headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        # 사업자등록번호는 123-45-67890 형식으로
        assert data["business_number"] == "123-45-67890"
        assert data["phone"] == "02-1234-5678"
        assert data["hours_note"] == "일요일 · 공휴일 휴무"
        got = (await client.get(_URL, headers=auth_headers)).json()["data"]
        assert got["address"] == "서울특별시 강남구 테헤란로 1"

    async def test_none_keeps_and_empty_clears(
        self, client: AsyncClient, auth_headers: dict
    ):
        await client.put(_URL, json=_FULL, headers=auth_headers)
        # 보내지 않은 칸은 그대로, "" 는 지우기, 앞뒤 공백 정리
        resp = await client.put(
            _URL, json={"parking": "", "ceo": "  김대표  "}, headers=auth_headers
        )
        data = resp.json()["data"]
        assert data["parking"] is None
        assert data["ceo"] == "김대표"
        assert data["phone"] == "02-1234-5678"

    async def test_phone_formats(self, client: AsyncClient, auth_headers: dict):
        for ok in ("010-1234-5678", "031-123-4567", "1588-1234", "0212345678"):
            resp = await client.put(_URL, json={"phone": ok}, headers=auth_headers)
            assert resp.status_code == 200, (ok, resp.text)
        bad = await client.put(_URL, json={"phone": "전화주세요"}, headers=auth_headers)
        assert bad.status_code == 400
        body = bad.json()["error"]
        assert body["code"] == "VALIDATION_ERROR"
        assert body["field"] == "phone"
        assert "전화번호" in body["message"]

    async def test_validation_errors(self, client: AsyncClient, auth_headers: dict):
        cases = [
            ({"business_number": "123-45"}, "business_number", "사업자등록번호"),
            ({"email": "not-an-email"}, "email", "이메일"),
            ({"address": "가" * 201}, "address", "주소"),
            ({"logo_url": "javascript:alert(1)"}, "logo_url", "이미지"),
        ]
        for payload, field, word in cases:
            resp = await client.put(_URL, json=payload, headers=auth_headers)
            assert resp.status_code == 400, payload
            err = resp.json()["error"]
            assert err["field"] == field and word in err["message"], err

    async def test_other_tenant_isolated(
        self,
        client: AsyncClient,
        auth_headers: dict,
        tenant_b_headers: dict,  # noqa: F811
    ):
        await client.put(_URL, json={"phone": "02-1111-2222"}, headers=auth_headers)
        # B 는 A 의 정보를 보지 못하고, B 가 저장해도 A 는 그대로
        assert (await client.get(_URL, headers=tenant_b_headers)).json()["data"] is None
        await client.put(_URL, json={"phone": "02-3333-4444"}, headers=tenant_b_headers)
        a = (await client.get(_URL, headers=auth_headers)).json()["data"]
        assert a["phone"] == "02-1111-2222"

    async def test_public_site_exposes_settings(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        await client.put(_URL, json=_FULL, headers=auth_headers)
        pub = await client.get(f"/api/public/site/{test_tenant['slug']}")
        assert pub.status_code == 200
        site = pub.json()["data"]["site_settings"]
        assert site["phone"] == "02-1234-5678"
        assert site["business_number"] == "123-45-67890"
        assert "id" not in site and "tenant_id" not in site

    async def test_public_site_without_settings(
        self, client: AsyncClient, test_tenant: dict
    ):
        pub = await client.get(f"/api/public/site/{test_tenant['slug']}")
        assert pub.json()["data"]["site_settings"] is None
