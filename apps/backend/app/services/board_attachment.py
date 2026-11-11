"""게시글 파일 첨부 (T-194, 게시판 모듈 기획서 BM-06).

파일은 이미지처럼 uploaded_files 에 기록해 요금제 저장 용량에 함께 센다. 글에 붙이면
board_post_attachments 로 잇고, 붙이지 않았거나 뺀 파일은 30일 뒤 미사용 정리가 지운다.
공개 첨부만 — 저장소가 익명 읽기라 비밀글 · 회원만 읽는 게시판에는 붙이지 않는다.
"""

import uuid
from datetime import UTC, datetime
from pathlib import PurePath
from typing import Any
from urllib.parse import quote
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.board import BoardPost, BoardPostAttachment
from app.models.file import UploadedFile
from app.models.tenant import Tenant
from app.services import image as image_service

MAX_ATTACHMENTS = 5
MAX_ATTACHMENT_SIZE = image_service.MAX_FILE_SIZE
FILE_NAME_MAX = 255
ATTACHMENT_FOLDER = "attachments"

_PDF = b"%PDF-"
_OLE = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"  # 옛 오피스 · 한글(HWP 5)
_ZIP = b"PK\x03\x04"  # 새 오피스 · HWPX · ZIP
_PNG = b"\x89PNG\r\n\x1a\n"
_JPEG = b"\xff\xd8\xff"
_GIF = b"GIF8"

# 확장자 → (Content-Type, 파일 앞부분 서명). 실행 파일 등 목록에 없는 것은 받지 않는다
ALLOWED_TYPES: dict[str, tuple[str, tuple[bytes, ...]]] = {
    "pdf": ("application/pdf", (_PDF,)),
    "hwp": ("application/x-hwp", (_OLE,)),
    "hwpx": ("application/hwp+zip", (_ZIP,)),
    "doc": ("application/msword", (_OLE,)),
    "docx": (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        (_ZIP,),
    ),
    "xls": ("application/vnd.ms-excel", (_OLE,)),
    "xlsx": (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        (_ZIP,),
    ),
    "ppt": ("application/vnd.ms-powerpoint", (_OLE,)),
    "pptx": (
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        (_ZIP,),
    ),
    "zip": ("application/zip", (_ZIP,)),
    "jpg": ("image/jpeg", (_JPEG,)),
    "jpeg": ("image/jpeg", (_JPEG,)),
    "png": ("image/png", (_PNG,)),
    "gif": ("image/gif", (_GIF,)),
}

MSG_TOO_LARGE = "파일은 하나에 20MB 까지 올릴 수 있습니다."
MSG_EMPTY = "빈 파일은 올릴 수 없습니다."
MSG_TYPE = (
    "PDF, 한글(HWP · HWPX), 워드 · 엑셀 · 파워포인트, ZIP, 사진(JPG · PNG · GIF)만 "
    "올릴 수 있습니다."
)
MSG_CONTENT_MISMATCH = "파일 내용이 확장자와 맞지 않습니다. 원본 파일을 올려 주세요."
MSG_QUOTA = "저장 용량이 모자랍니다. 요금제를 올리거나 안 쓰는 파일을 지워 주세요."
MSG_TOO_MANY = f"파일은 글 하나에 {MAX_ATTACHMENTS}개까지 붙일 수 있습니다."
MSG_UNKNOWN_FILE = "붙일 수 없는 파일이 있습니다. 다시 올려 주세요."
MSG_NOT_PUBLIC = (
    "비밀글과 회원만 읽는 게시판에는 아직 파일을 붙일 수 없습니다. "
    "첨부 파일은 주소를 아는 누구나 받을 수 있기 때문입니다."
)


def _bad(message: str, code: int = status.HTTP_400_BAD_REQUEST) -> HTTPException:
    return HTTPException(status_code=code, detail=message)


def clean_name(file_name: str | None) -> str:
    """경로를 떼고 줄바꿈 같은 제어 문자를 지운 이름."""
    name = PurePath((file_name or "").replace("\\", "/")).name
    name = "".join(ch for ch in name if ch.isprintable()).strip()
    return name[:FILE_NAME_MAX] or "file"


def check_file(file_name: str, data: bytes) -> tuple[str, str]:
    """확장자 · 크기 · 파일 서명 검사 — (확장자, Content-Type)."""
    if not data:
        raise _bad(MSG_EMPTY)
    if len(data) > MAX_ATTACHMENT_SIZE:
        raise _bad(MSG_TOO_LARGE, status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
    ext = PurePath(file_name).suffix.lower().lstrip(".")
    if ext not in ALLOWED_TYPES:
        raise _bad(MSG_TYPE)
    content_type, signatures = ALLOWED_TYPES[ext]
    if not data.startswith(signatures):
        raise _bad(MSG_CONTENT_MISMATCH)
    return ext, content_type


def content_disposition(file_name: str) -> str:
    """원래 이름으로 내려받게 — 한글 이름은 RFC 5987 로, 옛 브라우저용 이름도 함께."""
    fallback = "".join(
        ch if ch.isascii() and ch not in '"\\' else "_" for ch in file_name
    )
    return f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{quote(file_name)}"


def is_attachment_url(tenant_id: UUID, file_url: str) -> bool:
    return f"/{tenant_id}/{ATTACHMENT_FOLDER}/" in file_url


async def upload(
    db: AsyncSession,
    tenant_id: UUID,
    user_id: UUID,
    file_name: str | None,
    data: bytes,
) -> UploadedFile:
    """글에 붙일 파일을 올린다 — 글을 저장해야 붙는다."""
    name = clean_name(file_name)
    ext, content_type = check_file(name, data)
    plan = (
        await db.execute(select(Tenant.plan_type).where(Tenant.id == tenant_id))
    ).scalar_one_or_none() or "BASIC"
    try:
        await image_service.check_storage_quota(db, tenant_id, plan, len(data))
    except image_service.StorageQuotaExceeded as exc:
        raise _bad(MSG_QUOTA, status.HTTP_422_UNPROCESSABLE_ENTITY) from exc
    file_id = uuid.uuid4()
    key = f"{tenant_id}/{ATTACHMENT_FOLDER}/{file_id}.{ext}"
    url = image_service.upload_to_storage(
        data, key, content_type, content_disposition(name)
    )
    uploaded = UploadedFile(
        id=file_id,
        tenant_id=tenant_id,
        file_name=name,
        file_url=url,
        file_size=len(data),
        mime_type=content_type,
        uploaded_by=user_id,
    )
    db.add(uploaded)
    await db.commit()
    return uploaded


def ensure_public_allowed(member_only: bool, is_secret: bool, has_files: bool) -> None:
    """공개 첨부를 붙일 수 있는 글인지 — 비밀글 · 회원만 읽는 게시판은 안 된다."""
    if has_files and (is_secret or member_only):
        raise _bad(MSG_NOT_PUBLIC)


async def _active_links(db: AsyncSession, post_id: UUID) -> list[BoardPostAttachment]:
    result = await db.execute(
        select(BoardPostAttachment)
        .where(
            BoardPostAttachment.post_id == post_id,
            BoardPostAttachment.deleted_at.is_(None),
        )
        .order_by(BoardPostAttachment.display_order)
    )
    return list(result.scalars().all())


async def has_attachments(db: AsyncSession, post_id: UUID) -> bool:
    return bool(await _active_links(db, post_id))


async def set_attachments(
    db: AsyncSession, post: BoardPost, file_ids: list[UUID]
) -> None:
    """글의 첨부를 이 순서 · 이 목록으로 맞춘다. 커밋은 부르는 쪽이."""
    ordered = list(dict.fromkeys(file_ids))
    if len(ordered) > MAX_ATTACHMENTS:
        raise _bad(MSG_TOO_MANY)
    if ordered:
        rows = await db.execute(
            select(UploadedFile.id, UploadedFile.file_url).where(
                UploadedFile.tenant_id == post.tenant_id,
                UploadedFile.id.in_(ordered),
            )
        )
        found = {
            file_id
            for file_id, url in rows.all()
            if is_attachment_url(post.tenant_id, url)
        }
        if found != set(ordered):
            raise _bad(MSG_UNKNOWN_FILE)
    links = {link.file_id: link for link in await _active_links(db, post.id)}
    now = datetime.now(UTC)
    for file_id, link in links.items():
        if file_id not in ordered:
            link.deleted_at = now
    for order, file_id in enumerate(ordered):
        existing = links.get(file_id)
        if existing is None:
            db.add(
                BoardPostAttachment(
                    tenant_id=post.tenant_id,
                    post_id=post.id,
                    file_id=file_id,
                    display_order=order,
                )
            )
        else:
            existing.display_order = order


async def list_attachments(db: AsyncSession, post_id: UUID) -> list[dict[str, Any]]:
    rows = await db.execute(
        select(UploadedFile)
        .join(BoardPostAttachment, BoardPostAttachment.file_id == UploadedFile.id)
        .where(
            BoardPostAttachment.post_id == post_id,
            BoardPostAttachment.deleted_at.is_(None),
        )
        .order_by(BoardPostAttachment.display_order)
    )
    return [file_item(file) for file in rows.scalars().all()]


def file_item(file: UploadedFile) -> dict[str, Any]:
    return {
        "id": file.id,
        "name": file.file_name,
        "size": file.file_size,
        "url": file.file_url,
        "content_type": file.mime_type,
    }
