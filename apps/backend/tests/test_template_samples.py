"""T-120 템플릿 샘플 콘텐츠 테스트 (기획서 11.8).

- 샘플 원본 파일 동기화: 백엔드 JSON == 클라이언트 sample-content.json, 시드 값 == 파일
- 샘플 섹션 타입·설정 키 형식 검사
- 테넌트 생성 시 시작 템플릿(template_code)이면 샘플로 시작 (+ 적용 상태, is_sample)
- 없는 시작 템플릿 404, 생략하면 기존 기본 섹션
- 공개 사이트 설정 값에 is_sample 포함
"""

import importlib.util
import json
import re
import uuid
from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token
from app.data.template_samples import load_sample
from tests.conftest import _TestSession  # type: ignore

ROOT = Path(__file__).resolve().parents[3]
CLIENT_TEMPLATES = ROOT / "apps" / "client" / "templates"

_SEED_PATH = Path(__file__).resolve().parent.parent / "scripts" / "seed.py"
_spec = importlib.util.spec_from_file_location("_seed_for_samples", _SEED_PATH)
assert _spec and _spec.loader
_seed = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_seed)


def _client_key(code: str) -> str:
    """TPL_HOSPITAL_A → hospital-a (클라이언트 폴더 이름)."""
    return code.removeprefix("TPL_").lower().replace("_", "-")


class TestSampleFiles:
    @pytest.mark.parametrize("template", _seed.CODE_TEMPLATES, ids=lambda t: t["code"])
    def test_backend_copy_equals_client_sample(self, template: dict):
        client_file = (
            CLIENT_TEMPLATES / _client_key(template["code"]) / "sample-content.json"
        )
        assert client_file.exists(), client_file
        client_sample = json.loads(client_file.read_text(encoding="utf-8"))
        assert load_sample(template["code"]) == client_sample, (
            "샘플이 다릅니다 — apps/client/templates/{key}/sample-content.json 을 "
            "apps/backend/app/data/templates/{code}.json 으로 복사하세요"
        )
        assert template["sample_content"] == client_sample
        assert client_sample["version"] == template["version"]

    @pytest.mark.parametrize("template", _seed.CODE_TEMPLATES, ids=lambda t: t["code"])
    def test_sample_sections_are_supported_by_manifest(self, template: dict):
        manifest = (
            CLIENT_TEMPLATES / _client_key(template["code"]) / "manifest.ts"
        ).read_text(encoding="utf-8")
        supported = set(
            re.findall(r"'([A-Z_]+)'", manifest.split("sections:")[-1].split("]")[0])
        )
        sample = template["sample_content"]
        assert sample["pages"]["home"], "home 페이지 샘플이 비어 있습니다"
        for page, sections in sample["pages"].items():
            for section in sections:
                assert section["section_type"] in supported, (page, section)
                assert section["label"]
                for key in section["settings"]:
                    assert re.fullmatch(r"[a-z][a-z0-9_]*", key), key

    def test_sample_images_use_shared_versioned_path(self):
        for template in _seed.CODE_TEMPLATES:
            prefix = (
                f"/templates/{_client_key(template['code'])}/{template['version']}/"
            )
            urls = re.findall(
                r'"(/templates/[^"]+)"', json.dumps(template["sample_content"])
            )
            assert urls
            for url in urls:
                assert url.startswith(prefix), url
                public = ROOT / "apps" / "client" / "public" / url.lstrip("/")
                assert public.exists(), f"샘플 이미지 파일 없음: {url}"


@pytest.fixture
async def super_headers() -> dict:
    user_id = uuid.uuid4()
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text(
                "INSERT INTO users (id, tenant_id, email, password_hash, role,"
                " is_active, created_at, updated_at) VALUES (:id, NULL, :email,"
                " 'x', 'SUPER_ADMIN', true, now(), now())"
            ),
            {"id": str(user_id), "email": f"sa-{uuid.uuid4().hex[:6]}@cms.io"},
        )
        await session.commit()
    token = create_access_token(
        user_id=user_id, tenant_id=None, role="SUPER_ADMIN", is_super_admin=True
    )
    yield {"Authorization": f"Bearer {token}"}
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        await session.execute(
            text("DELETE FROM users WHERE id = :id"), {"id": str(user_id)}
        )
        await session.commit()


@pytest.fixture
async def hospital_template():
    """시드와 같은 TPL_HOSPITAL_A 템플릿 (테스트 DB 에 없으면 만들고 끝나면 지움)."""
    definition = next(t for t in _seed.CODE_TEMPLATES if t["code"] == "TPL_HOSPITAL_A")
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        existing = (
            await session.execute(
                text("SELECT id FROM templates WHERE code = 'TPL_HOSPITAL_A'")
            )
        ).scalar_one_or_none()
        created = existing is None
        tid = existing or uuid.uuid4()
        if created:
            await session.execute(
                text(
                    "INSERT INTO templates (id, template_type, name, css_variables,"
                    " section_layouts, is_active, min_plan, code, renderer, styling,"
                    " version, sample_content, created_at, updated_at) VALUES"
                    " (:id, 'HOSPITAL', :name, CAST(:css AS jsonb), '[]'::jsonb, true,"
                    " 'BASIC', 'TPL_HOSPITAL_A', 'code', 'scss', :ver,"
                    " CAST(:sample AS jsonb), now(), now())"
                ),
                {
                    "id": str(tid),
                    "name": definition["name"],
                    "css": json.dumps(definition["css_variables"]),
                    "ver": definition["version"],
                    "sample": json.dumps(definition["sample_content"]),
                },
            )
            await session.commit()
    yield str(tid)
    if created:
        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            await session.execute(
                text("DELETE FROM templates WHERE id = :id"), {"id": str(tid)}
            )
            await session.commit()


async def _cleanup_tenant(slug: str) -> None:
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        sub = "(SELECT id FROM tenants WHERE slug = :s)"
        for table in (
            "subscriptions",
            "tenant_template_overrides",
            "template_change_history",
            "section_settings",
            "sections",
            "users",
        ):
            await session.execute(
                text(f"DELETE FROM {table} WHERE tenant_id IN {sub}"),  # noqa: S608
                {"s": slug},
            )
        await session.execute(text("DELETE FROM tenants WHERE slug = :s"), {"s": slug})
        await session.commit()


def _payload(slug: str, template_code: str | None = None) -> dict:
    body = {
        "name": "샘플 의원",
        "slug": slug,
        "template_type": "HOSPITAL",
        "plan_type": "BASIC",
        "admin_email": f"owner-{slug}@clinic.com",
        "admin_password": "password123",
    }
    if template_code:
        body["template_code"] = template_code
    return body


async def _tenant_rows(tenant_id: str, sql: str) -> list:
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        return list((await session.execute(text(sql), {"t": tenant_id})).all())


class TestTenantCreateWithTemplate:
    async def test_start_template_copies_sample_and_applies_template(
        self, client: AsyncClient, super_headers: dict, hospital_template: str
    ):
        slug = f"clinic-{uuid.uuid4().hex[:6]}"
        try:
            resp = await client.post(
                "/api/super/v1/tenants",
                headers=super_headers,
                json=_payload(slug, "TPL_HOSPITAL_A"),
            )
            assert resp.status_code == 200, resp.text
            tid = resp.json()["data"]["tenant"]["id"]

            sections = await _tenant_rows(
                tid,
                "SELECT section_type, page_key FROM sections WHERE tenant_id = :t"
                " ORDER BY display_order",
            )
            assert [s.section_type for s in sections] == [
                "HERO_SLIDER",
                "INTRO",
                "SERVICES",
                "VIDEO_PLAYLIST",
                "NOTICE_LATEST",
            ]
            assert {s.page_key for s in sections} == {"home"}

            flags = await _tenant_rows(
                tid,
                "SELECT DISTINCT is_sample FROM section_settings WHERE tenant_id = :t",
            )
            assert [f.is_sample for f in flags] == [True]

            override = await _tenant_rows(
                tid,
                "SELECT template_id FROM tenant_template_overrides"
                " WHERE tenant_id = :t",
            )
            assert str(override[0].template_id) == hospital_template

            site = await client.get(f"/api/public/site/{slug}")
            data = site.json()["data"]
            assert data["template"]["code"] == "TPL_HOSPITAL_A"
            intro = next(s for s in data["sections"] if s["section_type"] == "INTRO")
            title = next(st for st in intro["settings"] if st["field_key"] == "title")
            assert title["field_value"] == "Every Detail\nBegins with You"
            assert title["is_sample"] is True
        finally:
            await _cleanup_tenant(slug)

    async def test_unknown_start_template_is_404(
        self, client: AsyncClient, super_headers: dict
    ):
        slug = f"clinic-{uuid.uuid4().hex[:6]}"
        try:
            resp = await client.post(
                "/api/super/v1/tenants",
                headers=super_headers,
                json=_payload(slug, "TPL_NOT_EXISTS"),
            )
            assert resp.status_code == 404
        finally:
            await _cleanup_tenant(slug)

    async def test_without_start_template_keeps_default_sections(
        self, client: AsyncClient, super_headers: dict
    ):
        slug = f"clinic-{uuid.uuid4().hex[:6]}"
        try:
            resp = await client.post(
                "/api/super/v1/tenants", headers=super_headers, json=_payload(slug)
            )
            tid = resp.json()["data"]["tenant"]["id"]
            sections = await _tenant_rows(
                tid, "SELECT section_type FROM sections WHERE tenant_id = :t"
            )
            assert len(sections) == 4
        finally:
            await _cleanup_tenant(slug)
