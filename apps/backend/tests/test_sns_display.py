"""SNS 노출 위치 설정 (T-038-A, 기획서 AD-03) — 푸터 아이콘 · 카카오톡 플로팅 버튼."""

from httpx import AsyncClient

_URL = "/api/v1/sns-settings"


class TestSnsDisplayOptions:
    async def test_defaults_keep_previous_behaviour(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.put(
            _URL, json={"kakao_url": "https://pf.kakao.com/_a"}, headers=auth_headers
        )
        data = resp.json()["data"]
        assert data["show_in_footer"] is True
        assert data["show_floating"] is True
        assert data["floating_position"] == "BOTTOM_RIGHT"

    async def test_update_display_options(
        self, client: AsyncClient, auth_headers: dict
    ):
        await client.put(
            _URL, json={"kakao_url": "https://pf.kakao.com/_a"}, headers=auth_headers
        )
        resp = await client.put(
            _URL,
            json={
                "show_in_footer": False,
                "show_floating": False,
                "floating_position": "BOTTOM_LEFT",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = (await client.get(_URL, headers=auth_headers)).json()["data"]
        assert data["show_in_footer"] is False
        assert data["show_floating"] is False
        assert data["floating_position"] == "BOTTOM_LEFT"
        # 노출 설정만 바꿔도 채널 주소는 그대로
        assert data["kakao_url"] == "https://pf.kakao.com/_a"

    async def test_first_save_with_display_options(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.put(
            _URL,
            json={"show_floating": False, "floating_position": "BOTTOM_LEFT"},
            headers=auth_headers,
        )
        data = resp.json()["data"]
        assert data["show_floating"] is False
        assert data["show_in_footer"] is True
        assert data["floating_position"] == "BOTTOM_LEFT"

    async def test_invalid_position_rejected(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.put(
            _URL, json={"floating_position": "TOP_CENTER"}, headers=auth_headers
        )
        assert resp.status_code in (400, 422)
        assert resp.json()["success"] is False

    async def test_display_options_not_counted_as_channels(
        self, client: AsyncClient, auth_headers: dict
    ):
        """채널 수 한도(BASIC 2개)는 주소만 센다"""
        resp = await client.put(
            _URL,
            json={
                "kakao_url": "https://pf.kakao.com/_a",
                "instagram_url": "https://instagram.com/a",
                "show_in_footer": True,
                "show_floating": True,
                "floating_position": "BOTTOM_RIGHT",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200

    async def test_unauthenticated(self, client: AsyncClient):
        resp = await client.put(_URL, json={"show_floating": False})
        assert resp.status_code == 401

    async def test_exposed_on_public_site(
        self, client: AsyncClient, auth_headers: dict, test_tenant: dict
    ):
        await client.put(
            _URL,
            json={
                "kakao_url": "https://pf.kakao.com/_a",
                "show_in_footer": False,
                "floating_position": "BOTTOM_LEFT",
            },
            headers=auth_headers,
        )
        resp = await client.get(f"/api/public/site/{test_tenant['slug']}")
        sns = resp.json()["data"]["sns_settings"]
        assert sns["show_in_footer"] is False
        assert sns["show_floating"] is True
        assert sns["floating_position"] == "BOTTOM_LEFT"


class TestChannelLimitCountsSavedChannels:
    """채널 수 한도는 저장 후 '주소가 있는' 채널로 센다 (T-038-A 에서 발견한 버그).

    관리자 화면은 빈 칸도 "" 로 보내는데 예전엔 6칸이 모두 세어져
    BASIC · STANDARD 사업체는 SNS 설정을 저장할 수 없었다.
    """

    async def test_blank_fields_from_admin_form_not_counted(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.put(
            _URL,
            json={
                "kakao_url": "https://pf.kakao.com/_a",
                "instagram_url": "",
                "facebook_url": "",
                "youtube_url": "",
                "blog_url": "",
                "naver_url": "",
                "show_in_footer": False,
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert data["kakao_url"] == "https://pf.kakao.com/_a"
        # 빈 칸은 빈 문자열이 아니라 '없음' 으로 저장
        assert data["instagram_url"] is None

    async def test_existing_channels_count_toward_limit(
        self, client: AsyncClient, auth_headers: dict
    ):
        """한 번에 1개씩 나눠 보내도 저장 후 합계가 한도(BASIC 2)를 넘으면 거절"""
        for url in ("https://pf.kakao.com/_a", "https://instagram.com/a"):
            field = "kakao_url" if "kakao" in url else "instagram_url"
            assert (
                await client.put(_URL, json={field: url}, headers=auth_headers)
            ).status_code == 200
        over = await client.put(
            _URL, json={"youtube_url": "https://youtube.com/a"}, headers=auth_headers
        )
        assert over.status_code == 400

    async def test_clearing_a_channel_frees_a_slot(
        self, client: AsyncClient, auth_headers: dict
    ):
        await client.put(
            _URL,
            json={
                "kakao_url": "https://pf.kakao.com/_a",
                "instagram_url": "https://instagram.com/a",
            },
            headers=auth_headers,
        )
        resp = await client.put(
            _URL,
            json={"instagram_url": "", "youtube_url": "https://youtube.com/a"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["instagram_url"] is None
        assert data["youtube_url"] == "https://youtube.com/a"
