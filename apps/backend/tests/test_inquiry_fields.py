"""업종별 문의 폼 칸 (T-051-A) — 칸 정의 · 검증 · 공개 API · 저장."""

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.services.inquiry_fields import (
    MULTISELECT_MAX,
    InquiryFieldError,
    clean_detail,
    describe_detail,
    fields_for,
)
from tests.conftest import _TestSession

BASE_BODY = {
    "name": "홍길동",
    "phone": "010-1234-5678",
    "message": "업종별 문의 칸 테스트입니다. 답변 부탁드립니다.",
}


async def _set_template_type(tenant_id: str, template_type: str) -> None:
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text("UPDATE tenants SET template_type = :t WHERE id = :id"),
            {"t": template_type, "id": tenant_id},
        )
        await session.commit()


async def _saved_detail(inquiry_id: str) -> dict:
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        result = await session.execute(
            text("SELECT detail FROM inquiries WHERE id = :id"), {"id": inquiry_id}
        )
        return result.scalar_one()


async def _cleanup_inquiries(tenant_id: str) -> None:
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text("DELETE FROM inquiries WHERE tenant_id = :tid"), {"tid": tenant_id}
        )
        await session.commit()


@pytest.fixture
async def hospital_tenant(test_tenant: dict):
    await _set_template_type(test_tenant["id"], "HOSPITAL")
    yield test_tenant
    await _cleanup_inquiries(test_tenant["id"])


@pytest.fixture
async def pension_tenant(test_tenant: dict):
    await _set_template_type(test_tenant["id"], "PENSION")
    yield test_tenant
    await _cleanup_inquiries(test_tenant["id"])


@pytest.fixture
async def startup_tenant(test_tenant: dict):
    await _set_template_type(test_tenant["id"], "STARTUP")
    yield test_tenant
    await _cleanup_inquiries(test_tenant["id"])


async def _submit(client: AsyncClient, slug: str, **extra: object):
    return await client.post(
        "/api/public/inquiries",
        params={"tenant_slug": slug},
        json={**BASE_BODY, **extra},
    )


# ── 칸 정의 ─────────────────────────────────────────────────────────────────


class TestFieldsFor:
    def test_hospital_fields_and_types(self):
        form = fields_for("HOSPITAL")
        keys = [f["key"] for f in form["fields"]]
        assert keys == ["department", "visit_type", "symptoms"]
        types = [t["value"] for t in form["inquiry_types"]]
        assert types == ["GENERAL", "RESERVATION", "SYMPTOM"]

    def test_pension_has_no_symptom_type(self):
        form = fields_for("PENSION")
        assert "SYMPTOM" not in [t["value"] for t in form["inquiry_types"]]
        assert [f["key"] for f in form["fields"]] == [
            "check_in",
            "check_out",
            "adults",
            "children",
            "room",
        ]

    def test_unknown_industry_falls_back_to_business(self):
        assert fields_for("GENERAL") == fields_for("STARTUP")
        assert fields_for(None) == fields_for("STARTUP")

    def test_case_insensitive(self):
        assert fields_for("hospital") == fields_for("HOSPITAL")

    def test_field_dict_shape(self):
        symptoms = fields_for("HOSPITAL")["fields"][2]
        assert symptoms["type"] == "multiselect"
        assert symptoms["max_selected"] == MULTISELECT_MAX
        assert {"value": "PAIN", "label": "통증"} in symptoms["options"]


# ── 값 검사 ─────────────────────────────────────────────────────────────────


class TestCleanDetail:
    def test_empty(self):
        assert clean_detail("HOSPITAL", None) == {}
        assert clean_detail("HOSPITAL", {}) == {}

    def test_hospital_valid(self):
        detail = clean_detail(
            "HOSPITAL",
            {"department": "DENTAL", "visit_type": "FIRST", "symptoms": ["PAIN"]},
        )
        assert detail == {
            "department": "DENTAL",
            "visit_type": "FIRST",
            "symptoms": ["PAIN"],
        }

    def test_unknown_and_other_industry_keys_dropped(self):
        detail = clean_detail(
            "HOSPITAL", {"department": "DENTAL", "adults": 2, "hacker": "x"}
        )
        assert detail == {"department": "DENTAL"}

    def test_empty_values_dropped(self):
        detail = clean_detail(
            "HOSPITAL", {"department": "", "symptoms": [], "visit_type": None}
        )
        assert detail == {}

    def test_invalid_select_option(self):
        with pytest.raises(InquiryFieldError) as exc:
            clean_detail("HOSPITAL", {"department": "MAGIC"})
        assert exc.value.field == "detail.department"

    def test_multiselect_dedup(self):
        detail = clean_detail("HOSPITAL", {"symptoms": ["PAIN", "PAIN", "FEVER"]})
        assert detail == {"symptoms": ["PAIN", "FEVER"]}

    def test_multiselect_invalid_item(self):
        with pytest.raises(InquiryFieldError):
            clean_detail("HOSPITAL", {"symptoms": ["PAIN", "NOPE"]})

    def test_multiselect_not_list(self):
        with pytest.raises(InquiryFieldError):
            clean_detail("HOSPITAL", {"symptoms": "PAIN"})

    def test_multiselect_too_many(self):
        with pytest.raises(InquiryFieldError):
            clean_detail("HOSPITAL", {"symptoms": ["PAIN"] * (MULTISELECT_MAX + 1)})

    def test_pension_valid(self):
        detail = clean_detail(
            "PENSION",
            {
                "check_in": "2026-11-01",
                "check_out": "2026-11-03",
                "adults": 2,
                "children": 0,
                "room": "  오션뷰 A동 ",
            },
        )
        assert detail == {
            "check_in": "2026-11-01",
            "check_out": "2026-11-03",
            "adults": 2,
            "children": 0,
            "room": "오션뷰 A동",
        }

    def test_invalid_date(self):
        with pytest.raises(InquiryFieldError) as exc:
            clean_detail("PENSION", {"check_in": "2026-13-40"})
        assert exc.value.field == "detail.check_in"

    def test_checkout_must_follow_checkin(self):
        with pytest.raises(InquiryFieldError) as exc:
            clean_detail(
                "PENSION", {"check_in": "2026-11-03", "check_out": "2026-11-03"}
            )
        assert exc.value.field == "detail.check_out"

    @pytest.mark.parametrize("value", [0, 31, "2", True, 1.5])
    def test_invalid_adults(self, value: object):
        with pytest.raises(InquiryFieldError):
            clean_detail("PENSION", {"adults": value})

    def test_text_too_long(self):
        with pytest.raises(InquiryFieldError):
            clean_detail("STARTUP", {"company": "가" * 101})


# ── 공개 API ────────────────────────────────────────────────────────────────


class TestFieldsApi:
    async def test_get_fields_hospital(self, client: AsyncClient, hospital_tenant):
        resp = await client.get(
            "/api/public/inquiries/fields",
            params={"tenant_slug": hospital_tenant["slug"]},
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data == fields_for("HOSPITAL")

    async def test_get_fields_tenant_not_found(self, client: AsyncClient):
        resp = await client.get(
            "/api/public/inquiries/fields", params={"tenant_slug": "no-such-tenant"}
        )
        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "NOT_FOUND"

    async def test_get_fields_requires_slug(self, client: AsyncClient):
        resp = await client.get("/api/public/inquiries/fields")
        assert resp.status_code == 400


class TestSubmitWithDetail:
    async def test_hospital_detail_saved(self, client: AsyncClient, hospital_tenant):
        resp = await _submit(
            client,
            hospital_tenant["slug"],
            inquiry_type="SYMPTOM",
            detail={
                "department": "INTERNAL",
                "visit_type": "RETURN",
                "symptoms": ["FEVER", "COLD"],
                "check_in": "2026-11-01",  # 다른 업종 칸 — 저장 안 됨
            },
        )
        assert resp.status_code == 200
        saved = await _saved_detail(resp.json()["data"]["inquiry_id"])
        assert saved == {
            "department": "INTERNAL",
            "visit_type": "RETURN",
            "symptoms": ["FEVER", "COLD"],
        }

    async def test_pension_detail_saved(self, client: AsyncClient, pension_tenant):
        resp = await _submit(
            client,
            pension_tenant["slug"],
            inquiry_type="RESERVATION",
            detail={"check_in": "2026-12-24", "check_out": "2026-12-26", "adults": 4},
        )
        assert resp.status_code == 200
        saved = await _saved_detail(resp.json()["data"]["inquiry_id"])
        assert saved == {
            "check_in": "2026-12-24",
            "check_out": "2026-12-26",
            "adults": 4,
        }

    async def test_startup_detail_saved(self, client: AsyncClient, startup_tenant):
        resp = await _submit(
            client,
            startup_tenant["slug"],
            detail={"company": "주식회사 테스트", "topic": "QUOTE"},
        )
        assert resp.status_code == 200
        saved = await _saved_detail(resp.json()["data"]["inquiry_id"])
        assert saved == {"company": "주식회사 테스트", "topic": "QUOTE"}

    async def test_invalid_option_returns_400(
        self, client: AsyncClient, hospital_tenant
    ):
        resp = await _submit(
            client, hospital_tenant["slug"], detail={"department": "MAGIC"}
        )
        assert resp.status_code == 400
        error = resp.json()["error"]
        assert error["code"] == "VALIDATION_ERROR"
        assert error["field"] == "detail.department"
        assert error["message"] == "선택할 수 없는 값입니다."

    async def test_too_many_keys_rejected(self, client: AsyncClient, hospital_tenant):
        resp = await _submit(
            client,
            hospital_tenant["slug"],
            detail={f"k{i}": "v" for i in range(21)},
        )
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "VALIDATION_ERROR"

    async def test_without_detail_still_works(
        self, client: AsyncClient, hospital_tenant
    ):
        """기존 폼(detail 없음)도 그대로 접수 — 빈 객체로 저장."""
        resp = await _submit(client, hospital_tenant["slug"])
        assert resp.status_code == 200
        assert await _saved_detail(resp.json()["data"]["inquiry_id"]) == {}

    async def test_admin_detail_response(
        self, client: AsyncClient, hospital_tenant, auth_headers: dict
    ):
        resp = await _submit(
            client, hospital_tenant["slug"], detail={"visit_type": "FIRST"}
        )
        inquiry_id = resp.json()["data"]["inquiry_id"]
        detail_resp = await client.get(
            f"/api/v1/inquiries/{inquiry_id}", headers=auth_headers
        )
        assert detail_resp.status_code == 200
        data = detail_resp.json()["data"]
        assert data["detail"] == {"visit_type": "FIRST"}
        assert data["detail_items"] == [
            {"label": "초진/재진", "value": "초진 (처음 방문)"}
        ]


class TestDescribeDetail:
    def test_labels_in_definition_order(self):
        items = describe_detail(
            "HOSPITAL",
            {"symptoms": ["PAIN", "FEVER"], "department": "DENTAL"},
        )
        assert items == [
            {"label": "진료과", "value": "치과"},
            {"label": "증상", "value": "통증, 발열"},
        ]

    def test_numbers_and_dates(self):
        items = describe_detail("PENSION", {"adults": 2, "check_in": "2026-11-01"})
        assert items == [
            {"label": "체크인", "value": "2026-11-01"},
            {"label": "성인", "value": "2"},
        ]

    def test_unknown_keys_kept_at_end(self):
        """업종이 바뀌어도 이미 받은 값은 보여 준다."""
        items = describe_detail("STARTUP", {"department": "DENTAL", "topic": "QUOTE"})
        assert items == [
            {"label": "문의 분야", "value": "견적 문의"},
            {"label": "department", "value": "DENTAL"},
        ]

    def test_empty(self):
        assert describe_detail("HOSPITAL", {}) == []
        assert describe_detail("HOSPITAL", None) == []
