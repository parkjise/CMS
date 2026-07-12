"""T-083 관측성 테스트: /metrics 노출 및 요청 집계."""

import pytest


@pytest.mark.asyncio
async def test_metrics_endpoint_exposes_prometheus_format(client):
    """정상: /metrics가 Prometheus 텍스트 포맷으로 응답한다."""
    resp = await client.get("/metrics")
    assert resp.status_code == 200
    assert "text/plain" in resp.headers["content-type"]
    body = resp.text
    # 정의한 메트릭 이름이 노출되어야 한다
    assert "http_request_duration_seconds" in body
    assert "http_requests_total" in body


@pytest.mark.asyncio
async def test_metrics_counts_requests(client):
    """정상: 요청을 보내면 카운터가 증가한다(핸들러 라벨 집계)."""
    # /health 요청 → 집계 발생
    await client.get("/health")
    resp = await client.get("/metrics")
    body = resp.text
    # /health 핸들러가 200으로 최소 1회 집계
    assert 'handler="/health"' in body
    assert 'status="200"' in body


@pytest.mark.asyncio
async def test_metrics_endpoint_not_self_counted(client):
    """/metrics 자체는 집계 대상에서 제외한다(카디널리티/노이즈 방지)."""
    await client.get("/metrics")
    resp = await client.get("/metrics")
    assert 'handler="/metrics"' not in resp.text
