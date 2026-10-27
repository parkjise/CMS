"""갤러리 이미지 목록 설정 (T-064-A) — 검사 · 편집 모드 저장 · 관리자 저장."""

import json
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.services.gallery_settings import (
    CAPTION_MAX_LENGTH,
    MAX_ITEMS,
    GallerySettingError,
    normalize_gallery_items,
)
from tests.conftest import _TestSession

IMG = "https://cdn.example.com/t/gallery/s/a.webp"


def _items(n: int, caption: str = "") -> str:
    return json.dumps(
        [{"image_url": f"{IMG}?{i}", "caption": caption} for i in range(n)]
    )


async def _setting(section_id: str) -> tuple[str | None, str | None]:
    async with _TestSession() as session:
        await session.execute(
            text("SELECT set_config('app.is_super_admin', 'true', true)")
        )
        row = await session.execute(
            text(
                "SELECT field_value, value_type FROM section_settings "
                "WHERE section_id = :sid AND field_key = 'gallery_items'"
            ),
            {"sid": section_id},
        )
        result = row.first()
        return (result.field_value, result.value_type) if result else (None, None)


class TestNormalize:
    def test_none_and_empty_pass_through(self):
        assert normalize_gallery_items(None) is None
        assert normalize_gallery_items("") == ""

    def test_keeps_only_known_keys_and_trims(self):
        raw = json.dumps(
            [{"image_url": f" {IMG} ", "caption": " 로비 ", "evil": "<script>"}]
        )
        assert json.loads(normalize_gallery_items(raw)) == [
            {"image_url": IMG, "caption": "로비"}
        ]

    def test_missing_caption_becomes_empty(self):
        raw = json.dumps([{"image_url": IMG}])
        assert json.loads(normalize_gallery_items(raw)) == [
            {"image_url": IMG, "caption": ""}
        ]

    def test_empty_list_ok(self):
        assert normalize_gallery_items("[]") == "[]"

    def test_relative_path_ok(self):
        raw = json.dumps([{"image_url": "/templates/a.webp", "caption": ""}])
        assert normalize_gallery_items(raw)

    def test_max_items(self):
        assert normalize_gallery_items(_items(MAX_ITEMS))
        with pytest.raises(GallerySettingError):
            normalize_gallery_items(_items(MAX_ITEMS + 1))

    def test_caption_too_long(self):
        with pytest.raises(GallerySettingError):
            normalize_gallery_items(_items(1, "가" * (CAPTION_MAX_LENGTH + 1)))

    @pytest.mark.parametrize(
        "url",
        [
            "javascript:alert(1)",
            "data:image/png;base64,AAAA",
            "//evil.example.com/a.webp",
            "",
            "ftp://x/a.webp",
        ],
    )
    def test_unsafe_url_rejected(self, url: str):
        with pytest.raises(GallerySettingError):
            normalize_gallery_items(json.dumps([{"image_url": url, "caption": ""}]))

    @pytest.mark.parametrize(
        "raw", ["not json", '{"image_url": "x"}', '["x"]', '[{"image_url": 1}]']
    )
    def test_bad_shape_rejected(self, raw: str):
        with pytest.raises(GallerySettingError):
            normalize_gallery_items(raw)


class TestBatchSaveGallery:
    _url = "/api/v1/edit/batch-save"

    async def test_saves_large_gallery_as_json(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        """사진 30장 (1000자 한도 초과 길이) 도 저장된다."""
        value = _items(MAX_ITEMS, "캡션")
        assert len(value) > 1000
        resp = await client.post(
            self._url,
            headers=auth_headers,
            json={
                "changes": [
                    {
                        "section_id": test_section["id"],
                        "field": "gallery_items",
                        "value": value,
                    }
                ]
            },
        )
        assert resp.status_code == 200
        assert resp.json()["data"] == {
            "saved_count": 1,
            "failed_count": 0,
            "cache_purged": True,
        }
        saved, value_type = await _setting(test_section["id"])
        assert value_type == "JSON"
        assert len(json.loads(saved)) == MAX_ITEMS

    async def test_invalid_gallery_not_saved(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        bad = json.dumps([{"image_url": "javascript:alert(1)", "caption": ""}])
        resp = await client.post(
            self._url,
            headers=auth_headers,
            json={
                "changes": [
                    {
                        "section_id": test_section["id"],
                        "field": "gallery_items",
                        "value": bad,
                    }
                ]
            },
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["failed_count"] == 1
        assert await _setting(test_section["id"]) == (None, None)

    async def test_other_tenant_section_not_saved(
        self, client: AsyncClient, auth_headers: dict
    ):
        other_tenant, other_section = uuid.uuid4(), uuid.uuid4()
        async with _TestSession() as session:
            await session.execute(
                text("SELECT set_config('app.is_super_admin', 'true', true)")
            )
            await session.execute(
                text(
                    "INSERT INTO tenants (id, name, slug, plan_type, is_active, created_at, updated_at) "  # noqa: E501
                    "VALUES (:id, 'other', :slug, 'FREE', true, now(), now())"
                ),
                {"id": str(other_tenant), "slug": f"other-{other_tenant.hex[:8]}"},
            )
            await session.execute(
                text(
                    "INSERT INTO sections (id, tenant_id, section_type, label, display_order, is_active, created_at, updated_at) "  # noqa: E501
                    "VALUES (:id, :tid, 'GALLERY', '갤러리', 0, true, now(), now())"
                ),
                {"id": str(other_section), "tid": str(other_tenant)},
            )
            await session.commit()
        try:
            resp = await client.post(
                self._url,
                headers=auth_headers,
                json={
                    "changes": [
                        {
                            "section_id": str(other_section),
                            "field": "gallery_items",
                            "value": _items(1),
                        }
                    ]
                },
            )
            assert resp.json()["data"]["saved_count"] == 0
            assert await _setting(str(other_section)) == (None, None)
        finally:
            async with _TestSession() as session:
                await session.execute(
                    text("SELECT set_config('app.is_super_admin', 'true', true)")
                )
                for table, col in (
                    ("section_settings", "tenant_id"),
                    ("sections", "tenant_id"),
                    ("tenants", "id"),
                ):
                    await session.execute(
                        text(f"DELETE FROM {table} WHERE {col} = :tid"),
                        {"tid": str(other_tenant)},
                    )
                await session.commit()


class TestSectionPatchGallery:
    async def test_admin_save_normalizes(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        raw = json.dumps([{"image_url": IMG, "caption": " 외관 ", "x": 1}])
        resp = await client.patch(
            f"/api/v1/sections/{test_section['id']}",
            headers=auth_headers,
            json={
                "settings": [
                    {
                        "field_key": "gallery_items",
                        "field_value": raw,
                        "value_type": "STRING",
                    }
                ]
            },
        )
        assert resp.status_code == 200
        saved, value_type = await _setting(test_section["id"])
        assert value_type == "JSON"
        assert json.loads(saved) == [{"image_url": IMG, "caption": "외관"}]

    async def test_admin_too_many_rejected(
        self, client: AsyncClient, auth_headers: dict, test_section: dict
    ):
        resp = await client.patch(
            f"/api/v1/sections/{test_section['id']}",
            headers=auth_headers,
            json={
                "settings": [
                    {
                        "field_key": "gallery_items",
                        "field_value": _items(MAX_ITEMS + 1),
                        "value_type": "JSON",
                    }
                ]
            },
        )
        assert resp.status_code == 400
        error = resp.json()["error"]
        assert error["code"] == "VALIDATION_ERROR"
        assert (
            error["message"]
            == f"갤러리 이미지는 최대 {MAX_ITEMS}장까지 등록할 수 있습니다."
        )
