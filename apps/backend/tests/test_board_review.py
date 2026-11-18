"""리뷰형 게시판 (T-218, 1113 #7) — 별점 · 평균, 병원 업종 차단."""

import pytest

from tests.test_board_guest_posts import (  # noqa: F401 — 픽스처
    BOARDS,
    PASSWORD,
    _configure,
    _guest,
    _sql,
    redis,
    tenant,
)


@pytest.fixture
async def review(client, auth_headers, tenant) -> dict:  # noqa: F811
    resp = await client.post(
        BOARDS,
        json={"name": "고객 후기", "slug": "reviews", "board_type": "REVIEW"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    resp = await _configure(client, auth_headers, data["id"])
    assert resp.status_code == 200, resp.text
    base = f"/api/public/site/{tenant['slug']}/boards/reviews/posts"
    data["public"] = base
    data["guest"] = f"{base}/guest"
    data["admin_posts"] = f"{BOARDS}/{data['id']}/posts"
    return data


async def _fields(client, headers, board_id: str) -> list[dict]:
    resp = await client.get(f"{BOARDS}/{board_id}/fields", headers=headers)
    return resp.json()["data"]


class TestReviewBoard:
    async def test_rating_field_always_added_not_required(
        self, client, auth_headers, review
    ):
        fields = await _fields(client, auth_headers, review["id"])
        assert [(f["field_key"], f["field_type"]) for f in fields] == [
            ("rating", "RATING")
        ]
        # 필수 표시가 없어 방문자 글쓰기가 켜진다 (위 _configure 가 200)
        assert fields[0]["is_required"] is False
        assert fields[0]["show_in_list"] is True

    async def test_guest_review_needs_rating(self, client, review):
        missing = await client.post(review["guest"], json=_guest())
        assert missing.status_code == 400
        assert missing.json()["error"]["message"] == "별점을 골라 주세요."
        bad = await client.post(review["guest"], json=_guest(rating=6))
        assert bad.status_code == 400
        resp = await client.post(review["guest"], json=_guest(rating=4))
        assert resp.status_code == 201, resp.text
        assert resp.json()["data"]["rating"] == 4

        # 고치기에서 별점을 바꾼다
        url = f"{review['public']}/{resp.json()['data']['id']}/guest"
        updated = await client.patch(url, json={"password": PASSWORD, "rating": 2})
        assert updated.status_code == 200, updated.text
        assert updated.json()["data"]["rating"] == 2

    async def test_admin_post_needs_rating(self, client, auth_headers, review):
        body = {"title": "관리자 후기", "status": "PUBLISHED", "body": []}
        missing = await client.post(
            review["admin_posts"], json=body, headers=auth_headers
        )
        assert missing.status_code == 400
        assert missing.json()["error"]["field"] == "custom_data.rating"
        # 임시저장은 별점 없이도 된다
        draft = await client.post(
            review["admin_posts"],
            json={**body, "status": "DRAFT"},
            headers=auth_headers,
        )
        assert draft.status_code == 201, draft.text
        ok = await client.post(
            review["admin_posts"],
            json={**body, "custom_data": {"rating": 5}},
            headers=auth_headers,
        )
        assert ok.status_code == 201, ok.text

    async def test_list_average_and_count(self, client, auth_headers, review):
        for rating in (5, 4, 4):
            resp = await client.post(review["guest"], json=_guest(rating=rating))
            assert resp.status_code == 201, resp.text
        # 공개하지 않은 글은 세지 않는다
        await client.post(
            review["admin_posts"],
            json={"title": "임시", "status": "DRAFT", "body": [], "custom_data": {}},
            headers=auth_headers,
        )
        data = (await client.get(review["public"])).json()["data"]
        assert data["rating_summary"] == {"average": 4.3, "count": 3}
        item = data["items"][0]
        assert [f["value"] for f in item["list_fields"]] == [4]
        assert item["summary"] is not None

    async def test_other_types_ignore_rating(
        self,
        client,
        auth_headers,
        tenant,  # noqa: F811
    ):
        resp = await client.post(
            BOARDS, json={"name": "방명록", "slug": "book"}, headers=auth_headers
        )
        board_id = resp.json()["data"]["id"]
        await _configure(client, auth_headers, board_id)
        base = f"/api/public/site/{tenant['slug']}/boards/book/posts"
        written = await client.post(f"{base}/guest", json=_guest(rating=3))
        assert written.status_code == 201, written.text
        assert written.json()["data"]["rating"] is None
        assert (await client.get(base)).json()["data"]["rating_summary"] is None

    async def test_switch_to_review_adds_rating(
        self,
        client,
        auth_headers,
        tenant,  # noqa: F811
    ):
        resp = await client.post(
            BOARDS, json={"name": "소식", "slug": "news"}, headers=auth_headers
        )
        board_id = resp.json()["data"]["id"]
        resp = await client.patch(
            f"{BOARDS}/{board_id}", json={"board_type": "REVIEW"}, headers=auth_headers
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["board_type"] == "REVIEW"
        fields = await _fields(client, auth_headers, board_id)
        assert [f["field_type"] for f in fields] == ["RATING"]
        # 다시 바꿔도 별점 칸은 하나
        await client.patch(
            f"{BOARDS}/{board_id}", json={"board_type": "LIST"}, headers=auth_headers
        )
        await client.patch(
            f"{BOARDS}/{board_id}", json={"board_type": "REVIEW"}, headers=auth_headers
        )
        assert len(await _fields(client, auth_headers, board_id)) == 1


class TestHospitalBlocked:
    @pytest.fixture
    async def hospital(self, tenant):  # noqa: F811
        await _sql(
            "UPDATE tenants SET template_type = 'HOSPITAL' WHERE id = :t",
            t=tenant["id"],
        )
        return tenant

    async def test_type_options(self, client, auth_headers, tenant):  # noqa: F811
        url = f"{BOARDS}/type-options"
        resp = await client.get(url, headers=auth_headers)
        assert resp.json()["data"]["blocked"] == {}
        await _sql(
            "UPDATE tenants SET template_type = 'HOSPITAL' WHERE id = :t",
            t=tenant["id"],
        )
        blocked = (await client.get(url, headers=auth_headers)).json()["data"]
        assert list(blocked["blocked"]) == ["REVIEW"]
        assert "의료법" in blocked["blocked"]["REVIEW"]

    async def test_create_400(self, client, auth_headers, hospital):
        resp = await client.post(
            BOARDS,
            json={"name": "후기", "slug": "reviews", "board_type": "REVIEW"},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        error = resp.json()["error"]
        assert error["field"] == "board_type"
        assert "의료법" in error["message"]

    async def test_change_400(self, client, auth_headers, hospital):
        resp = await client.post(
            BOARDS, json={"name": "소식", "slug": "news"}, headers=auth_headers
        )
        board_id = resp.json()["data"]["id"]
        resp = await client.patch(
            f"{BOARDS}/{board_id}", json={"board_type": "REVIEW"}, headers=auth_headers
        )
        assert resp.status_code == 400
        assert "의료법" in resp.json()["error"]["message"]
        resp = await client.get(f"{BOARDS}/{board_id}", headers=auth_headers)
        assert resp.json()["data"]["board_type"] == "LIST"
