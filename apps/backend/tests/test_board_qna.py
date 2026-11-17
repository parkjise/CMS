"""문의형(Q&A) 게시판 (T-219, 1113 #7) — 관리자 답변 · 상태, 비밀글 답변 가림."""

import pytest

from tests.test_board_guest_posts import (  # noqa: F401 — 픽스처
    BOARDS,
    PASSWORD,
    _configure,
    _guest,
    redis,
    tenant,
)


@pytest.fixture
async def qna(client, auth_headers, tenant) -> dict:  # noqa: F811
    resp = await client.post(
        BOARDS,
        json={"name": "묻고 답하기", "slug": "qna", "board_type": "QNA"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    resp = await _configure(client, auth_headers, data["id"])
    assert resp.status_code == 200, resp.text
    base = f"/api/public/site/{tenant['slug']}/boards/qna/posts"
    data["public"] = base
    data["guest"] = f"{base}/guest"
    data["admin_posts"] = f"{BOARDS}/{data['id']}/posts"
    return data


async def _answer(client, headers, board: dict, post_id: str, text: str):
    return await client.put(
        f"{board['admin_posts']}/{post_id}/answer",
        json={"answer": text},
        headers=headers,
    )


class TestAnswer:
    async def test_answer_then_clear(self, client, auth_headers, qna):
        post_id = (await client.post(qna["guest"], json=_guest())).json()["data"]["id"]
        listed = (await client.get(qna["public"])).json()["data"]["items"]
        assert listed[0]["answered"] is False

        resp = await _answer(
            client, auth_headers, qna, post_id, "  내일 연락드릴게요  "
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert data["answer"] == "내일 연락드릴게요"
        assert data["answered_at"] is not None

        listed = (await client.get(qna["public"])).json()["data"]["items"]
        assert listed[0]["answered"] is True
        detail = (await client.get(f"{qna['public']}/{post_id}")).json()["data"]
        assert detail["answer"] == "내일 연락드릴게요"
        assert detail["answered"] is True

        # 관리자 글 목록에도 상태
        admin = await client.get(qna["admin_posts"], headers=auth_headers)
        assert admin.json()["data"]["items"][0]["answered_at"] is not None

        cleared = await _answer(client, auth_headers, qna, post_id, " ")
        assert cleared.json()["data"]["answer"] is None
        assert cleared.json()["data"]["answered_at"] is None
        listed = (await client.get(qna["public"])).json()["data"]["items"]
        assert listed[0]["answered"] is False

    async def test_secret_answer_hidden_until_verified(self, client, auth_headers, qna):
        created = await client.post(qna["guest"], json=_guest(is_secret=True))
        post_id = created.json()["data"]["id"]
        await _answer(client, auth_headers, qna, post_id, "비밀 답변 010-0000")

        listed = (await client.get(qna["public"])).json()["data"]["items"]
        assert listed[0]["answered"] is True  # 상태는 보인다
        locked = (await client.get(f"{qna['public']}/{post_id}")).json()["data"]
        assert locked["locked"] is True
        assert locked["answer"] is None
        assert "010-0000" not in str(locked)

        verified = await client.post(
            f"{qna['public']}/{post_id}/guest/verify", json={"password": PASSWORD}
        )
        assert verified.json()["data"]["answer"] == "비밀 답변 010-0000"

    async def test_other_type_400(self, client, auth_headers, tenant):  # noqa: F811
        resp = await client.post(
            BOARDS, json={"name": "소식", "slug": "news"}, headers=auth_headers
        )
        board_id = resp.json()["data"]["id"]
        post = await client.post(
            f"{BOARDS}/{board_id}/posts",
            json={"title": "글", "status": "PUBLISHED", "body": []},
            headers=auth_headers,
        )
        resp = await client.put(
            f"{BOARDS}/{board_id}/posts/{post.json()['data']['id']}/answer",
            json={"answer": "답"},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert resp.json()["error"]["field"] == "answer"
        # 다른 유형은 목록에 상태가 없다
        listed = await client.get(
            f"/api/public/site/{tenant['slug']}/boards/news/posts"
        )
        assert listed.json()["data"]["items"][0]["answered"] is None

    async def test_too_long_and_auth(self, client, auth_headers, qna):
        post_id = (await client.post(qna["guest"], json=_guest())).json()["data"]["id"]
        url = f"{qna['admin_posts']}/{post_id}/answer"
        long = await client.put(url, json={"answer": "가" * 5001}, headers=auth_headers)
        assert long.status_code == 400
        assert (await client.put(url, json={"answer": "답"})).status_code == 401

    async def test_deleted_post_404(self, client, auth_headers, qna):
        post_id = (await client.post(qna["guest"], json=_guest())).json()["data"]["id"]
        await client.delete(f"{qna['admin_posts']}/{post_id}", headers=auth_headers)
        resp = await _answer(client, auth_headers, qna, post_id, "답")
        assert resp.status_code == 404
