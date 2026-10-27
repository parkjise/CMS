"""seed_features — 마이그레이션이 먼저 넣은 기능이 있어도 빠진 기능을 채운다 (T-037-A).

0024 마이그레이션이 회원 기능 3개를 넣어 두면, 예전 seed 는 '있으면 건너뜀' 이라
새 DB(CI · 새 서버)에 섹션 편집기 · SEO · 템플릿 등 기본 기능이 통째로 빠졌다.
DB 없이 세션을 흉내 내 key 기준 채우기만 검증한다.
"""

import importlib.util
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

_SEED_PATH = Path(__file__).resolve().parent.parent / "scripts" / "seed.py"
_spec = importlib.util.spec_from_file_location("_seed_module_features", _SEED_PATH)
assert _spec and _spec.loader
_seed = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_seed)


def _session(existing_keys: list[str]) -> MagicMock:
    result = MagicMock()
    result.scalars.return_value.all.return_value = existing_keys
    db = MagicMock()
    db.execute = AsyncMock(return_value=result)
    db.commit = AsyncMock()
    return db


async def test_fills_missing_when_migration_inserted_member_features():
    member_keys = ["SITE_MEMBER", "MEMBER_SOCIAL_LOGIN", "MEMBER_RESERVATION"]
    db = _session(member_keys)
    await _seed.seed_features(db)

    added = {call.args[0].key for call in db.add.call_args_list}
    expected = {f["key"] for f in _seed.FEATURES} - set(member_keys)
    assert added == expected
    assert "SECTION_EDITOR" in added
    db.commit.assert_awaited_once()


async def test_noop_when_all_present():
    db = _session([f["key"] for f in _seed.FEATURES])
    await _seed.seed_features(db)
    db.add.assert_not_called()
    db.commit.assert_not_awaited()
