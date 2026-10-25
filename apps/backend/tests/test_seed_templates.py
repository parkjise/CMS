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
