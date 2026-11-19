"""사이트 기본정보 확장 · 공개 항목 선택 (T-222, 사이트 관리 기획서 SM-01)."""

from httpx import AsyncClient

_URL = "/api/v1/site-settings"

_WEEK = {
    "mon": {
        "status": "open",
        "open": "09:00",
        "close": "18:00",
        "break_start": "12:00",
        "break_end": "13:00",
    },
    "sat": {"status": "open", "open": "10:00", "close": "14:00"},
    "sun": {"status": "closed"},
}

_INFO = {
    "site_name": "바른치과 공식 사이트",
    "company_name": "주식회사 바른",
    "ceo": "홍길동",
    "business_number": "1234567890",
    "mail_order_number": "제2026-서울강남-00000호",
    "business_type": "보건업",
    "business_item": "치과의원",
    "phone": "02-1234-5678",
    "cs_phone": "1588-1234",
    "fax": "02-1234-5679",
    "email": "hello@clinic.kr",
    "postal_code": "06236",
    "address": "서울특별시 강남구 테헤란로 1",
    "address_detail": "3층",
    "hours_temp_note": "설 연휴 휴진",
    "privacy_officer": "개인정보팀",
    "privacy_email": "privacy@clinic.kr",
    "copyright": "© 바른치과. All rights reserved.",
    "weekly_hours": _WEEK,
}


async def _public(client: AsyncClient, slug: str) -> dict:
    resp = await client.get(f"/api/public/site/{slug}")
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


class TestSiteInfoFields:
    async def test_save_new_fields(self, client: AsyncClient, auth_headers: dict):
        resp = await client.put(_URL, json=_INFO, headers=auth_headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert data["company_name"] == "주식회사 바른"
        assert data["mail_order_number"] == "제2026-서울강남-00000호"
        assert data["postal_code"] == "06236"
        assert data["hidden_fields"] == []
        # 요일 순서대로, 휴무 날은 시각을 비운다
        assert list(data["weekly_hours"]) == ["mon", "sat", "sun"]
        assert data["weekly_hours"]["mon"]["break_start"] == "12:00"
        assert data["weekly_hours"]["sun"] == {
            "status": "closed",
            "open": None,
            "close": None,
            "break_start": None,
            "break_end": None,
        }

    async def test_closed_and_24h_drop_times(
        self, client: AsyncClient, auth_headers: dict
    ):
        week = {
            "tue": {"status": "24h", "open": "09:00", "close": "18:00"},
            "wed": {"status": "closed", "open": "09:00"},
        }
        resp = await client.put(_URL, json={"weekly_hours": week}, headers=auth_headers)
        assert resp.status_code == 200, resp.text
        hours = resp.json()["data"]["weekly_hours"]
        assert hours["tue"]["open"] is None and hours["wed"]["open"] is None

    async def test_overnight_and_24_00(self, client: AsyncClient, auth_headers: dict):
        week = {
            # 다음 날 새벽 2시에 닫고, 점심시간이 자정을 넘겨도 영업시간 안
            "fri": {
                "status": "open",
                "open": "18:00",
                "close": "02:00",
                "break_start": "23:30",
                "break_end": "00:30",
            },
            "sat": {"status": "open", "open": "10:00", "close": "24:00"},
        }
        resp = await client.put(_URL, json={"weekly_hours": week}, headers=auth_headers)
        assert resp.status_code == 200, resp.text

    async def test_empty_week_clears(self, client: AsyncClient, auth_headers: dict):
        await client.put(_URL, json={"weekly_hours": _WEEK}, headers=auth_headers)
        # 보내지 않으면 그대로, {} 는 지우기
        kept = await client.put(_URL, json={"ceo": "김"}, headers=auth_headers)
        assert kept.json()["data"]["weekly_hours"] is not None
        clear = {"weekly_hours": {}}
        cleared = await client.put(_URL, json=clear, headers=auth_headers)
        assert cleared.json()["data"]["weekly_hours"] is None

    async def test_validation_errors(self, client: AsyncClient, auth_headers: dict):
        cases = [
            ({"postal_code": "123-456"}, "postal_code", "우편번호"),
            ({"fax": "팩스 없음"}, "fax", "전화번호"),
            ({"cs_phone": "12"}, "cs_phone", "전화번호"),
            ({"privacy_email": "privacy"}, "privacy_email", "이메일"),
            ({"site_name": "가" * 101}, "site_name", "사이트명"),
            ({"copyright": "가" * 201}, "copyright", "저작권"),
            ({"hidden_fields": ["password"]}, "hidden_fields", "공개 항목"),
        ]
        for payload, field, word in cases:
            resp = await client.put(_URL, json=payload, headers=auth_headers)
            assert resp.status_code == 400, payload
            err = resp.json()["error"]
            assert err["code"] == "VALIDATION_ERROR"
            assert err["field"] == field and word in err["message"], err

    async def test_weekly_hours_errors(self, client: AsyncClient, auth_headers: dict):
        cases = [
            ({"holiday": {"status": "closed"}}, "요일"),
            ({"mon": {"status": "open", "open": "09:00"}}, "닫는 시각"),
            ({"mon": {"status": "open", "open": "9시", "close": "18:00"}}, "09:00"),
            ({"mon": {"status": "open", "open": "25:00", "close": "18:00"}}, "09:00"),
            ({"mon": {"status": "open", "open": "09:00", "close": "09:00"}}, "24시간"),
            (
                {
                    "mon": {
                        "status": "open",
                        "open": "09:00",
                        "close": "18:00",
                        "break_start": "12:00",
                    }
                },
                "점심시간",
            ),
            (
                {
                    "mon": {
                        "status": "open",
                        "open": "09:00",
                        "close": "18:00",
                        "break_start": "19:00",
                        "break_end": "20:00",
                    }
                },
                "영업시간 안",
            ),
            ({"mon": {"status": "sometimes"}}, ""),
        ]
        for week, word in cases:
            resp = await client.put(
                _URL, json={"weekly_hours": week}, headers=auth_headers
            )
            assert resp.status_code == 400, week
            err = resp.json()["error"]
            assert err["code"] == "VALIDATION_ERROR"
            assert str(err["field"]).startswith("weekly_hours"), err
            assert word in err["message"], err

    async def test_hidden_fields_sorted_and_deduped(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.put(
            _URL,
            json={"hidden_fields": ["fax", "ceo", "fax"]},
            headers=auth_headers,
        )
        assert resp.json()["data"]["hidden_fields"] == ["ceo", "fax"]
        resp = await client.put(_URL, json={"hidden_fields": []}, headers=auth_headers)
        assert resp.json()["data"]["hidden_fields"] == []


class TestPublicSiteInfo:
    async def test_all_public_by_default(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        await client.put(_URL, json=_INFO, headers=auth_headers)
        data = await _public(client, test_tenant["slug"])
        info = data["site_settings"]
        assert info["company_name"] == "주식회사 바른"
        assert info["fax"] == "02-1234-5679"
        assert info["weekly_hours"]["mon"]["open"] == "09:00"
        assert info["hidden_fields"] == []
        # 사이트명이 홈페이지 이름이 된다
        assert data["tenant"]["name"] == "바른치과 공식 사이트"

    async def test_tenant_name_without_site_name(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        await client.put(_URL, json={"phone": "02-1234-5678"}, headers=auth_headers)
        data = await _public(client, test_tenant["slug"])
        assert data["tenant"]["name"].startswith("Test Tenant")

    async def test_hidden_groups_removed(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        hidden = ["ceo", "address", "phone", "fax", "email", "business"]
        await client.put(
            _URL, json={**_INFO, "hidden_fields": hidden}, headers=auth_headers
        )
        resp = await client.get(f"/api/public/site/{test_tenant['slug']}")
        info = resp.json()["data"]["site_settings"]
        for field in (
            "ceo",
            "postal_code",
            "address",
            "address_detail",
            "phone",
            "cs_phone",
            "fax",
            "email",
            "business_number",
            "mail_order_number",
            "business_type",
            "business_item",
        ):
            assert info[field] is None, field
        # 숨긴 묶음은 알려 준다 — 홈페이지가 섹션 값으로 대신 채우지 않게
        assert info["hidden_fields"] == hidden
        # 숨기지 않은 항목은 그대로
        assert info["company_name"] == "주식회사 바른"
        assert info["privacy_officer"] == "개인정보팀"
        # 응답 어디에도 숨긴 값이 없다
        for secret in ("홍길동", "02-1234-5678", "hello@clinic.kr", "123-45-67890"):
            assert secret not in resp.text, secret

    async def test_hidden_phone_not_in_availability(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        await client.put(
            _URL,
            json={**_INFO, "hidden_fields": ["phone"]},
            headers=auth_headers,
        )
        resp = await client.get(f"/api/public/site/{test_tenant['slug']}/availability")
        data = resp.json()["data"]
        assert data["phone"] is None
        assert data["name"] == "바른치과 공식 사이트"

    async def test_policy_uses_public_values_only(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        await client.put(_URL, json=_INFO, headers=auth_headers)
        slug = test_tenant["slug"]
        privacy = (await client.get(f"/api/public/site/{slug}/policies/privacy")).json()
        body = privacy["data"]["body"]
        # 보호책임자를 정했으면 그 사람 · 그 이메일
        assert "책임자: 개인정보팀" in body
        assert "privacy@clinic.kr" in body
        terms = (await client.get(f"/api/public/site/{slug}/policies/terms")).json()
        assert "주식회사 바른" in terms["data"]["body"]

        await client.put(
            _URL, json={"hidden_fields": ["ceo", "phone"]}, headers=auth_headers
        )
        terms = (await client.get(f"/api/public/site/{slug}/policies/terms")).json()
        assert "홍길동" not in terms["data"]["body"]
        assert "02-1234-5678" not in terms["data"]["body"]

    async def test_save_purges_site_cache(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        # 먼저 공개 응답을 캐시에 올린 뒤 숨기면 바로 빠져야 한다
        await client.put(_URL, json=_INFO, headers=auth_headers)
        assert (await _public(client, test_tenant["slug"]))["site_settings"]["ceo"]
        await client.put(_URL, json={"hidden_fields": ["ceo"]}, headers=auth_headers)
        info = (await _public(client, test_tenant["slug"]))["site_settings"]
        assert info["ceo"] is None
