"""T-056 시드 템플릿 데이터 정합성 테스트.

DB 없이 seed.py 의 TEMPLATES 상수 구조만 검증한다.
"""

import importlib.util
from pathlib import Path

_SEED_PATH = Path(__file__).resolve().parent.parent / "scripts" / "seed.py"
_spec = importlib.util.spec_from_file_location("_seed_module", _SEED_PATH)
assert _spec and _spec.loader
_seed = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_seed)

TEMPLATES = _seed.TEMPLATES
CODE_TEMPLATES = _seed.CODE_TEMPLATES

VALID_PLANS = {"BASIC", "STANDARD", "PREMIUM"}
VALID_INDUSTRIES = {"HOSPITAL", "PENSION", "STARTUP", "GENERAL"}
EXPECTED_NAMES = {
    "모던 미니멀",
    "웜 트러스트",
    "네이처 프레시",
    "프로페셔널",
    "바이브런트 유스",
    "클린 샵",
}


def test_six_templates_with_unique_names():
    assert len(TEMPLATES) == 6
    names = {t["name"] for t in TEMPLATES}
    assert names == EXPECTED_NAMES


def test_each_template_has_valid_metadata():
    for t in TEMPLATES:
        assert t["template_type"] in VALID_INDUSTRIES
        assert t["min_plan"] in VALID_PLANS
        assert t["thumbnail_url"].startswith("/templates/")
        assert t["thumbnail_url"].endswith(".svg")
        assert isinstance(t["section_layouts"], list) and t["section_layouts"]


def test_each_template_css_has_core_keys():
    for t in TEMPLATES:
        css = t["css_variables"]
        assert css["primary"].startswith("#")
        for key in ("background", "text_primary", "font_heading", "border_radius"):
            assert css.get(key), f"{t['name']} 누락: {key}"


def test_plan_gating_coverage():
    # 게이팅 시연을 위해 STANDARD 이상 템플릿이 최소 1개 존재
    assert any(t["min_plan"] != "BASIC" for t in TEMPLATES)


def test_code_templates_match_client_registry():
    """코드형 템플릿 code 는 클라이언트 매니페스트 id 와 같아야 한다 (T-117)."""
    manifest = (
        Path(__file__).resolve().parents[3]
        / "apps"
        / "client"
        / "templates"
        / "hospital-a"
        / "manifest.ts"
    ).read_text(encoding="utf-8")
    codes = {t["code"] for t in CODE_TEMPLATES}
    assert codes == {"TPL_HOSPITAL_A"}
    assert "id: 'TPL_HOSPITAL_A'" in manifest
    for t in CODE_TEMPLATES:
        assert t["renderer"] == "code"
        assert t["styling"] in {"scss", "tailwind"}
        assert t["min_plan"] in VALID_PLANS
        for key, value in t["css_variables"].items():
            assert f"{key}: {value!r}".replace('"', "'") in manifest.replace(
                '"', "'"
            ), key


async def test_seed_test_sections_idempotent():
    """T-051-A · T-066-A: test-tenant 에 E2E 섹션을 타입별로 한 번만 만든다."""
    import uuid

    from sqlalchemy import func, select, text

    from app.models.section import Section, SectionSetting
    from app.models.tenant import Tenant
    from tests.conftest import _TestSession

    async with _TestSession() as db:
        await db.execute(text("SELECT set_config('app.is_super_admin', 'true', false)"))
        tenant = (
            await db.execute(select(Tenant).where(Tenant.slug == "test-tenant"))
        ).scalar_one_or_none()
        created = tenant is None
        if created:
            tenant = Tenant(id=uuid.uuid4(), slug="test-tenant", name="테스트 사업체")
            db.add(tenant)
            await db.commit()
        try:
            await _seed.seed_test_sections(db)
            await _seed.seed_test_sections(db)
            for section_type, *_ in _seed.TEST_SECTIONS:
                count = await db.scalar(
                    select(func.count())
                    .select_from(Section)
                    .where(
                        Section.tenant_id == tenant.id,
                        Section.section_type == section_type,
                        Section.deleted_at.is_(None),
                    )
                )
                assert count == 1, section_type
        finally:
            if created:
                for model in (SectionSetting, Section):
                    await db.execute(
                        model.__table__.delete().where(
                            model.__table__.c.tenant_id == tenant.id
                        )
                    )
                await db.execute(
                    Tenant.__table__.delete().where(Tenant.__table__.c.id == tenant.id)
                )
                await db.commit()
