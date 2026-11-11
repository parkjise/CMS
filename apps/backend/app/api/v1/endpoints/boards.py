"""게시판 관리 API (T-139, 게시판 모듈 기획서 9장)."""

from typing import Literal
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import AwareDatetime
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.core.client_info import client_ip
from app.core.deps import (
    bearer,
    get_current_user,
    get_db,
    get_db_with_rls,
    get_tenant_id,
    require_feature,
)
from app.models.board import Board, BoardCategory, BoardField, BoardPost
from app.models.user import User
from app.schemas.board import (
    BoardCreate,
    BoardLimitsResponse,
    BoardPresetField,
    BoardResponse,
    BoardRestoreResponse,
    BoardUpdate,
    CategoryCreate,
    CategoryMergeRequest,
    CategoryMergeResponse,
    CategoryOrderRequest,
    CategoryResponse,
    CategoryUpdate,
    ChoiceRemapRequest,
    ChoiceRemapResponse,
    FieldConvertPreview,
    FieldConvertPreviewRequest,
    FieldConvertRequest,
    FieldConvertResult,
    FieldCreate,
    FieldOption,
    FieldOrderRequest,
    FieldResponse,
    FieldUpdate,
    GuestPasswordRequest,
    GuestPostCreate,
    GuestPostResponse,
    GuestPostUpdate,
    MemberPostCreate,
    MemberPostResponse,
    MemberPostUpdate,
    PermissionOptionsResponse,
    PostAttachment,
    PostBulkRequest,
    PostBulkResponse,
    PostCreate,
    PostListItem,
    PostListResponse,
    PostMovePreview,
    PostMoveRequest,
    PostMoveResult,
    PostOverviewItem,
    PostOverviewListResponse,
    PostResponse,
    PostStatus,
    PostUpdate,
    PostVersionDetail,
    PostVersionItem,
    PublicListColumn,
    PublicPostDetail,
    PublicPostItem,
    PublicPostListResponse,
    PublicPostLocation,
    PublicSitemapPost,
    ReportCreate,
    ReportedPostItem,
    ReportResolveRequest,
)
from app.schemas.common import ApiResponse
from app.services import board as board_service
from app.services import board_access, board_presets
from app.services import board_attachment as attachment_service
from app.services import board_category as category_service
from app.services import board_field as field_service
from app.services import board_guest_post as guest_post_service
from app.services import board_member_post as member_post_service
from app.services import board_report as report_service
from app.services import field_convert as convert_service
from app.services import post_move as move_service
from app.services import post_version as version_service
from app.services import site_settings as site_settings_service

MSG_BOARD_NOT_FOUND = "게시판을 찾을 수 없습니다."
MSG_POST_NOT_FOUND = "게시글을 찾을 수 없습니다."
MSG_VERSION_NOT_FOUND = "이전 버전을 찾을 수 없습니다."
MSG_FIELD_NOT_FOUND = "칸을 찾을 수 없습니다."
MSG_CATEGORY_NOT_FOUND = "카테고리를 찾을 수 없습니다."

router = APIRouter(
    prefix="/boards",
    tags=["boards"],
    dependencies=[Depends(require_feature("BOARD_MANAGER"))],
)
posts_router = APIRouter(
    prefix="/posts",
    tags=["boards"],
    dependencies=[Depends(require_feature("BOARD_MANAGER"))],
)
public_router = APIRouter(tags=["public"])


def _not_found(message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message)


def _board_audit(board: Board) -> dict:
    """감사 로그에 남기는 게시판 값 — 본문 · 개인정보 없이."""
    options = board_service.board_options(board)
    return {
        "name": board.name,
        "slug": board.slug,
        "board_type": board.board_type,
        "status": board.status,
        "sort_order": options["sort_order"],
        "page_size": options["page_size"],
        "seo_index": options["seo_index"],
        "permissions": options["permissions"],
        "operation": options["operation"],
    }


async def _audit_board(
    db: AsyncSession,
    user: User,
    action: str,
    board: Board,
    before: dict | None = None,
) -> None:
    await log_action(
        db,
        user,
        action,
        "board",
        board.id,
        before=before,
        after=_board_audit(board),
        tenant_id=board.tenant_id,
    )


async def _audit_post(
    db: AsyncSession, user: User, action: str, post: BoardPost
) -> None:
    await log_action(
        db,
        user,
        action,
        "board_post",
        post.id,
        after={"title": post.title, "status": post.status},
        tenant_id=post.tenant_id,
    )


async def _board_or_404(
    board_id: UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
) -> Board:
    board = await board_service.get_board(db, tenant_id, board_id)
    if board is None:
        raise _not_found(MSG_BOARD_NOT_FOUND)
    return board


async def _post_or_404(
    post_id: UUID,
    board: Board = Depends(_board_or_404),
    db: AsyncSession = Depends(get_db_with_rls),
) -> BoardPost:
    post = await board_service.get_post(db, board.tenant_id, board.id, post_id)
    if post is None:
        raise _not_found(MSG_POST_NOT_FOUND)
    return post


@router.get("", response_model=ApiResponse[list[BoardResponse]])
async def list_boards(
    trash: bool = False,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    return ApiResponse.ok(await board_service.list_boards(db, tenant_id, trash=trash))


@router.post(
    "",
    response_model=ApiResponse[BoardResponse],
    status_code=status.HTTP_201_CREATED,
)
async def create_board(
    data: BoardCreate,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
    current_user: User = Depends(get_current_user),
):
    board = await board_service.create_board(db, tenant_id, data)
    if not data.in_menu:
        await site_settings_service.hide_board_from_menu(db, board)
    response = await board_service.board_response(db, board)
    await _audit_board(db, current_user, "BOARD_CREATED", board)
    return ApiResponse.ok(response)


@router.get("/limits", response_model=ApiResponse[BoardLimitsResponse])
async def get_limits(
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    return ApiResponse.ok(await board_service.get_limits(db, tenant_id))


@router.get("/presets", response_model=ApiResponse[dict[str, list[BoardPresetField]]])
async def list_board_presets():
    """새 게시판 유형별 추천 칸 (T-183)."""
    return ApiResponse.ok(
        {
            board_type: [BoardPresetField.model_validate(p) for p in presets]
            for board_type, presets in board_presets.presets_response().items()
        }
    )


@router.post("/clear-samples", response_model=ApiResponse[dict])
async def clear_samples(
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    await board_service.clear_samples(db, tenant_id)
    return ApiResponse.ok({"cleared": True})


@router.get("/{board_id}", response_model=ApiResponse[BoardResponse])
async def get_board(
    board: Board = Depends(_board_or_404),
    db: AsyncSession = Depends(get_db_with_rls),
):
    return ApiResponse.ok(await board_service.board_response(db, board))


@router.patch("/{board_id}", response_model=ApiResponse[BoardResponse])
async def update_board(
    data: BoardUpdate,
    board: Board = Depends(_board_or_404),
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    before = _board_audit(board)
    updated = await board_service.update_board(db, board, data)
    response = await board_service.board_response(db, updated)
    await _audit_board(db, current_user, "BOARD_UPDATED", updated, before=before)
    return ApiResponse.ok(response)


@router.get(
    "/{board_id}/permission-options",
    response_model=ApiResponse[PermissionOptionsResponse],
)
async def get_permission_options(
    board: Board = Depends(_board_or_404),
    db: AsyncSession = Depends(get_db_with_rls),
):
    """권한 탭 — 회원 읽기 · 글쓰기를 고를 수 없으면 그 이유 (T-150-B)."""
    return ApiResponse.ok(
        PermissionOptionsResponse(
            member_read_blocked=await board_access.member_read_blocked(db, board),
            member_write_blocked=await board_access.member_write_blocked(db, board),
        )
    )


async def _with_member_names(db: AsyncSession, posts: list[BoardPost]) -> list[dict]:
    """관리자 글 목록 — 홈페이지에서 쓴 글은 회원 이름을 붙인다 (T-150-B)."""
    names = await member_post_service.member_names(
        db, {p.author_member_id for p in posts if p.author_member_id}
    )
    attached = await attachment_service.posts_with_attachments(
        db, [p.id for p in posts]
    )
    return [
        {
            **PostListItem.model_validate(p).model_dump(),
            "author_member_name": names.get(p.author_member_id)
            if p.author_member_id
            else None,
            "has_attachments": p.id in attached,
        }
        for p in posts
    ]


@router.post(
    "/{board_id}/duplicate",
    response_model=ApiResponse[BoardResponse],
    status_code=status.HTTP_201_CREATED,
)
async def duplicate_board(
    board: Board = Depends(_board_or_404),
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    copy = await board_service.duplicate_board(db, board)
    # 같은 이름이 메뉴에 두 번 나오지 않게 — 이름을 고치고 직접 켠다
    await site_settings_service.hide_board_from_menu(db, copy)
    response = await board_service.board_response(db, copy)
    await _audit_board(db, current_user, "BOARD_DUPLICATED", copy)
    return ApiResponse.ok(response)


@router.delete("/{board_id}", response_model=ApiResponse[dict])
async def delete_board(
    board: Board = Depends(_board_or_404),
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    await board_service.delete_board(db, board)
    await _audit_board(db, current_user, "BOARD_DELETED", board)
    return ApiResponse.ok({"deleted": True})


@router.post("/{board_id}/restore", response_model=ApiResponse[BoardRestoreResponse])
async def restore_board(
    board_id: UUID,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
    current_user: User = Depends(get_current_user),
):
    board = await board_service.get_trashed_board(db, tenant_id, board_id)
    if board is None:
        raise _not_found(MSG_BOARD_NOT_FOUND)
    restored, changed = await board_service.restore_board(db, board)
    response = BoardRestoreResponse(
        board=BoardResponse(**await board_service.board_response(db, restored)),
        slug_changed=changed,
    )
    await _audit_board(db, current_user, "BOARD_RESTORED", restored)
    return ApiResponse.ok(response)


# ── 필드 (T-142-A) ───────────────────────────────────────────────────────


def _field_response(field: BoardField) -> FieldResponse:
    options = field.field_options or {}
    return FieldResponse(
        id=field.id,
        board_id=field.board_id,
        field_key=field.field_key,
        label=field.label,
        field_type=field.field_type,
        is_required=field.is_required,
        is_visible=field.is_visible,
        help_text=field.help_text,
        placeholder=field.placeholder,
        default_value=field.default_value,
        options=[FieldOption(**choice) for choice in options.get("choices", [])],
        min=options.get("min"),
        max=options.get("max"),
        show_in_list=options.get("show_in_list", False),
        display_order=field.display_order,
        deleted_at=field.deleted_at,
    )


async def _audit_field(
    db: AsyncSession,
    user: User,
    action: str,
    field: BoardField,
    before: dict | None = None,
) -> None:
    await log_action(
        db,
        user,
        action,
        "board_field",
        field.id,
        before=before,
        after=_field_audit(field),
        tenant_id=field.tenant_id,
    )


def _field_audit(field: BoardField) -> dict:
    """감사 로그 값 — 칸 설정만, 글의 값은 넣지 않는다."""
    return {
        "board_id": str(field.board_id),
        "field_key": field.field_key,
        "label": field.label,
        "field_type": field.field_type,
        "is_required": field.is_required,
        "is_visible": field.is_visible,
    }


async def _field_or_404(
    field_id: UUID,
    board: Board = Depends(_board_or_404),
    db: AsyncSession = Depends(get_db_with_rls),
) -> BoardField:
    field = await field_service.get_field(db, board.id, field_id)
    if field is None:
        raise _not_found(MSG_FIELD_NOT_FOUND)
    return field


@router.get("/{board_id}/fields", response_model=ApiResponse[list[FieldResponse]])
async def list_fields(
    trash: bool = False,
    board: Board = Depends(_board_or_404),
    db: AsyncSession = Depends(get_db_with_rls),
):
    fields = await field_service.list_fields(db, board.id, deleted=trash)
    counts = await field_service.value_counts(db, board.id)
    choices = await field_service.choice_counts(db, board.id, fields)
    return ApiResponse.ok(
        [
            _field_response(f).model_copy(
                update={
                    "value_count": counts.get(f.field_key, 0),
                    "choice_counts": choices.get(f.id, {}),
                }
            )
            for f in fields
        ]
    )


@router.post(
    "/{board_id}/fields",
    response_model=ApiResponse[FieldResponse],
    status_code=status.HTTP_201_CREATED,
)
async def create_field(
    data: FieldCreate,
    board: Board = Depends(_board_or_404),
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    field = await field_service.create_field(db, board, data)
    response = _field_response(field)
    await _audit_field(db, current_user, "BOARD_FIELD_CREATED", field)
    return ApiResponse.ok(response)


@router.patch(
    "/{board_id}/fields/order", response_model=ApiResponse[list[FieldResponse]]
)
async def reorder_fields(
    data: FieldOrderRequest,
    board: Board = Depends(_board_or_404),
    db: AsyncSession = Depends(get_db_with_rls),
):
    fields = await field_service.reorder_fields(db, board, data.field_ids)
    return ApiResponse.ok([_field_response(f) for f in fields])


@router.patch(
    "/{board_id}/fields/{field_id}", response_model=ApiResponse[FieldResponse]
)
async def update_field(
    data: FieldUpdate,
    board: Board = Depends(_board_or_404),
    field: BoardField = Depends(_field_or_404),
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    if field.deleted_at is not None:
        raise _not_found(MSG_FIELD_NOT_FOUND)
    before = _field_audit(field)
    updated = await field_service.update_field(db, board, field, data)
    response = _field_response(updated)
    await _audit_field(db, current_user, "BOARD_FIELD_UPDATED", updated, before=before)
    return ApiResponse.ok(response)


@router.post(
    "/{board_id}/fields/{field_id}/choices/remap",
    response_model=ApiResponse[ChoiceRemapResponse],
)
async def remap_field_choice(
    data: ChoiceRemapRequest,
    board: Board = Depends(_board_or_404),
    field: BoardField = Depends(_field_or_404),
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    """쓰고 있는 선택지의 글을 다른 선택지로 옮기거나 값을 비운다 (T-180)."""
    if field.deleted_at is not None:
        raise _not_found(MSG_FIELD_NOT_FOUND)
    moved = await field_service.remap_choice(db, board, field, data, current_user)
    return ApiResponse.ok(ChoiceRemapResponse(moved=moved))


@router.post(
    "/{board_id}/fields/{field_id}/convert/preview",
    response_model=ApiResponse[FieldConvertPreview],
)
async def preview_field_convert(
    data: FieldConvertPreviewRequest,
    board: Board = Depends(_board_or_404),
    field: BoardField = Depends(_field_or_404),
    db: AsyncSession = Depends(get_db_with_rls),
):
    """값이 있는 칸의 유형 바꾸기 미리보기 — 저장하지 않는다 (T-182)."""
    if field.deleted_at is not None:
        raise _not_found(MSG_FIELD_NOT_FOUND)
    result = await convert_service.preview(db, board, field, data.field_type)
    return ApiResponse.ok(FieldConvertPreview.model_validate(result))


@router.post(
    "/{board_id}/fields/{field_id}/convert",
    response_model=ApiResponse[FieldConvertResult],
)
async def convert_field(
    data: FieldConvertRequest,
    board: Board = Depends(_board_or_404),
    field: BoardField = Depends(_field_or_404),
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    """유형을 바꾸고 글 값도 함께 바꾼다 (T-182)."""
    if field.deleted_at is not None:
        raise _not_found(MSG_FIELD_NOT_FOUND)
    result = await convert_service.convert(
        db, board, field, data.field_type, data.clear_failed, current_user
    )
    counts = await field_service.value_counts(db, board.id)
    choices = await field_service.choice_counts(db, board.id, [field])
    response = _field_response(field).model_copy(
        update={
            "value_count": counts.get(field.field_key, 0),
            "choice_counts": choices.get(field.id, {}),
        }
    )
    return ApiResponse.ok(FieldConvertResult(**result, field=response))


@router.delete("/{board_id}/fields/{field_id}", response_model=ApiResponse[dict])
async def delete_field(
    board: Board = Depends(_board_or_404),
    field: BoardField = Depends(_field_or_404),
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    if field.deleted_at is not None:
        raise _not_found(MSG_FIELD_NOT_FOUND)
    await field_service.delete_field(db, board, field)
    await _audit_field(db, current_user, "BOARD_FIELD_DELETED", field)
    return ApiResponse.ok({"deleted": True})


@router.post(
    "/{board_id}/fields/{field_id}/restore", response_model=ApiResponse[FieldResponse]
)
async def restore_field(
    board: Board = Depends(_board_or_404),
    field: BoardField = Depends(_field_or_404),
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    if field.deleted_at is None:
        raise _not_found(MSG_FIELD_NOT_FOUND)
    restored = await field_service.restore_field(db, board, field)
    response = _field_response(restored)
    await _audit_field(db, current_user, "BOARD_FIELD_RESTORED", restored)
    return ApiResponse.ok(response)


# ── 카테고리 (T-149) ─────────────────────────────────────────────────────


async def _audit_category(
    db: AsyncSession,
    user: User,
    action: str,
    category: BoardCategory,
    before: dict | None = None,
    extra: dict | None = None,
) -> None:
    await log_action(
        db,
        user,
        action,
        "board_category",
        category.id,
        before=before,
        after={
            "board_id": str(category.board_id),
            "name": category.name,
            "is_active": category.is_active,
            "parent_id": str(category.parent_id) if category.parent_id else None,
            **(extra or {}),
        },
        tenant_id=category.tenant_id,
    )


async def _category_or_404(
    category_id: UUID,
    board: Board = Depends(_board_or_404),
    db: AsyncSession = Depends(get_db_with_rls),
) -> BoardCategory:
    category = await category_service.get_category(db, board.id, category_id)
    if category is None:
        raise _not_found(MSG_CATEGORY_NOT_FOUND)
    return category


@router.get(
    "/{board_id}/categories", response_model=ApiResponse[list[CategoryResponse]]
)
async def list_categories(
    board: Board = Depends(_board_or_404),
    db: AsyncSession = Depends(get_db_with_rls),
):
    categories = await category_service.list_categories(db, board.id)
    counts = await category_service.post_counts(db, board.id)
    return ApiResponse.ok(
        [
            CategoryResponse.model_validate(c).model_copy(
                update={"post_count": counts.get(c.id, 0)}
            )
            for c in categories
        ]
    )


@router.post(
    "/{board_id}/categories",
    response_model=ApiResponse[CategoryResponse],
    status_code=status.HTTP_201_CREATED,
)
async def create_category(
    data: CategoryCreate,
    board: Board = Depends(_board_or_404),
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    category = await category_service.create_category(db, board, data)
    response = CategoryResponse.model_validate(category)
    await _audit_category(db, current_user, "BOARD_CATEGORY_CREATED", category)
    return ApiResponse.ok(response)


@router.post(
    "/{board_id}/categories/merge", response_model=ApiResponse[CategoryMergeResponse]
)
async def merge_categories(
    data: CategoryMergeRequest,
    board: Board = Depends(_board_or_404),
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    moved = await category_service.merge_categories(db, board, data, current_user)
    return ApiResponse.ok(
        CategoryMergeResponse(merged=len(data.source_ids), moved=moved)
    )


@router.patch(
    "/{board_id}/categories/order",
    response_model=ApiResponse[list[CategoryResponse]],
)
async def reorder_categories(
    data: CategoryOrderRequest,
    board: Board = Depends(_board_or_404),
    db: AsyncSession = Depends(get_db_with_rls),
):
    categories = await category_service.reorder_categories(db, board, data.category_ids)
    return ApiResponse.ok([CategoryResponse.model_validate(c) for c in categories])


@router.patch(
    "/{board_id}/categories/{category_id}",
    response_model=ApiResponse[CategoryResponse],
)
async def update_category(
    data: CategoryUpdate,
    board: Board = Depends(_board_or_404),
    category: BoardCategory = Depends(_category_or_404),
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    before = {
        "name": category.name,
        "is_active": category.is_active,
        "parent_id": str(category.parent_id) if category.parent_id else None,
    }
    updated = await category_service.update_category(db, board, category, data)
    response = CategoryResponse.model_validate(updated)
    await _audit_category(
        db, current_user, "BOARD_CATEGORY_UPDATED", updated, before=before
    )
    return ApiResponse.ok(response)


@router.delete("/{board_id}/categories/{category_id}", response_model=ApiResponse[dict])
async def delete_category(
    move_to: UUID | None = None,
    board: Board = Depends(_board_or_404),
    category: BoardCategory = Depends(_category_or_404),
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    """move_to — 이 분류의 글을 옮길 분류. 없으면 분류 없음."""
    moved = await category_service.delete_category(db, board, category, move_to)
    await _audit_category(
        db,
        current_user,
        "BOARD_CATEGORY_DELETED",
        category,
        extra={
            "moved_posts": moved,
            "move_to": str(move_to) if move_to else None,
        },
    )
    return ApiResponse.ok({"deleted": True, "moved": moved})


@router.get("/{board_id}/posts", response_model=ApiResponse[PostListResponse])
async def list_posts(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    post_status: PostStatus | None = Query(default=None, alias="status"),
    q: str | None = Query(default=None, max_length=100),
    category_id: UUID | None = None,
    trash: bool = False,
    board: Board = Depends(_board_or_404),
    db: AsyncSession = Depends(get_db_with_rls),
):
    posts, total = await board_service.list_posts(
        db,
        board.tenant_id,
        board.id,
        page=page,
        size=size,
        status=post_status,
        q=q,
        trash=trash,
        category_id=category_id,
    )
    return ApiResponse.ok(
        PostListResponse(
            total=total,
            page=page,
            size=size,
            items=[
                PostListItem(**item) for item in await _with_member_names(db, posts)
            ],
        )
    )


@router.post(
    "/{board_id}/posts",
    response_model=ApiResponse[PostResponse],
    status_code=status.HTTP_201_CREATED,
)
async def create_post(
    data: PostCreate,
    board: Board = Depends(_board_or_404),
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    board_service.ensure_secret_allowed(board, data.is_secret)
    attachment_service.ensure_public_allowed(
        board_service.is_member_only(board), data.is_secret, bool(data.attachment_ids)
    )
    post = await board_service.create_post(
        db, board.tenant_id, board.id, current_user.id, data
    )
    return ApiResponse.ok(await _post_response(db, post))


async def _post_response(db: AsyncSession, post: BoardPost) -> PostResponse:
    attachments = await attachment_service.list_attachments(db, post.id)
    return PostResponse.model_validate(post).model_copy(
        update={"attachments": [PostAttachment(**item) for item in attachments]}
    )


@router.post(
    "/{board_id}/attachments",
    response_model=ApiResponse[PostAttachment],
    status_code=status.HTTP_201_CREATED,
)
async def upload_attachment(
    file: UploadFile = File(...),
    board: Board = Depends(_board_or_404),
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    """글에 붙일 파일 (T-194) — 글을 저장할 때 attachment_ids 로 보내야 붙는다."""
    uploaded = await attachment_service.upload(
        db, board.tenant_id, current_user.id, file.filename, await file.read()
    )
    return ApiResponse.ok(PostAttachment(**attachment_service.file_item(uploaded)))


@router.get("/{board_id}/posts/{post_id}", response_model=ApiResponse[PostResponse])
async def get_post(
    post: BoardPost = Depends(_post_or_404),
    db: AsyncSession = Depends(get_db_with_rls),
):
    return ApiResponse.ok(await _post_response(db, post))


@router.patch("/{board_id}/posts/{post_id}", response_model=ApiResponse[PostResponse])
async def update_post(
    data: PostUpdate,
    board: Board = Depends(_board_or_404),
    post: BoardPost = Depends(_post_or_404),
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    if post.deleted_at is not None:
        raise _not_found(MSG_POST_NOT_FOUND)
    board_service.ensure_secret_allowed(board, data.is_secret)
    attachment_service.ensure_public_allowed(
        board_service.is_member_only(board),
        post.is_secret if data.is_secret is None else data.is_secret,
        bool(data.attachment_ids)
        if data.attachment_ids is not None
        else await attachment_service.has_attachments(db, post.id),
    )
    updated = await board_service.update_post(db, post, data, current_user.id)
    return ApiResponse.ok(await _post_response(db, updated))


@router.get(
    "/{board_id}/posts/{post_id}/versions",
    response_model=ApiResponse[list[PostVersionItem]],
)
async def list_post_versions(
    post: BoardPost = Depends(_post_or_404),
    db: AsyncSession = Depends(get_db_with_rls),
):
    """글의 이전 버전 (T-191) — 최근 것부터, 최대 20개."""
    return ApiResponse.ok(await version_service.list_versions(db, post))


@router.get(
    "/{board_id}/posts/{post_id}/versions/{version_id}",
    response_model=ApiResponse[PostVersionDetail],
)
async def get_post_version(
    version_id: UUID,
    post: BoardPost = Depends(_post_or_404),
    db: AsyncSession = Depends(get_db_with_rls),
):
    version = await version_service.get_version(db, post, version_id)
    if version is None:
        raise _not_found(MSG_VERSION_NOT_FOUND)
    return ApiResponse.ok(version)


@router.delete("/{board_id}/posts/{post_id}", response_model=ApiResponse[dict])
async def delete_post(
    post: BoardPost = Depends(_post_or_404),
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    await board_service.delete_post(db, post)
    await _audit_post(db, current_user, "POST_DELETED", post)
    return ApiResponse.ok({"deleted": True})


@router.post(
    "/{board_id}/posts/{post_id}/restore", response_model=ApiResponse[PostResponse]
)
async def restore_post(
    post: BoardPost = Depends(_post_or_404),
    db: AsyncSession = Depends(get_db_with_rls),
    current_user: User = Depends(get_current_user),
):
    restored = await board_service.restore_post(db, post)
    response = await _post_response(db, restored)
    await _audit_post(db, current_user, "POST_RESTORED", restored)
    return ApiResponse.ok(response)


# ── 공개 (홈페이지) — 공개 글만. 기능을 꺼도 공개 홈페이지는 그대로 (T-138 원칙) ─────


# ── 전체 글 (BM-05, T-140-C) ─────────────────────────────────────────────


@posts_router.get("", response_model=ApiResponse[PostOverviewListResponse])
async def list_all_posts(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    board_id: UUID | None = None,
    category_id: UUID | None = None,
    post_status: PostStatus | None = Query(default=None, alias="status"),
    q: str | None = Query(default=None, max_length=100),
    author: str | None = Query(default=None, max_length=100),
    body_q: str | None = Query(default=None, max_length=100),
    trash: bool = False,
    created_from: AwareDatetime | None = None,
    created_before: AwareDatetime | None = None,
    updated_from: AwareDatetime | None = None,
    updated_before: AwareDatetime | None = None,
    published_from: AwareDatetime | None = None,
    published_before: AwareDatetime | None = None,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    rows, total = await board_service.list_all_posts(
        db,
        tenant_id,
        page=page,
        size=size,
        board_id=board_id,
        category_id=category_id,
        status=post_status,
        q=q,
        author=author,
        body_q=body_q,
        trash=trash,
        created_from=created_from,
        created_before=created_before,
        updated_from=updated_from,
        updated_before=updated_before,
        published_from=published_from,
        published_before=published_before,
    )
    return ApiResponse.ok(
        PostOverviewListResponse(
            total=total,
            page=page,
            size=size,
            items=[
                PostOverviewItem(**item, board_name=name)
                for item, (_post, name) in zip(
                    await _with_member_names(db, [post for post, _name in rows]),
                    rows,
                    strict=True,
                )
            ],
        )
    )


@posts_router.post("/bulk", response_model=ApiResponse[PostBulkResponse])
async def bulk_update_posts(
    data: PostBulkRequest,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
    current_user: User = Depends(get_current_user),
):
    ids = await board_service.bulk_update_posts(
        db, tenant_id, data.post_ids, data.action
    )
    await log_action(
        db,
        current_user,
        f"POST_BULK_{data.action}",
        "board_post",
        after={"post_ids": [str(i) for i in ids]},
        tenant_id=tenant_id,
    )
    return ApiResponse.ok(PostBulkResponse(updated=len(ids)))


@posts_router.post("/move/preview", response_model=ApiResponse[PostMovePreview])
async def preview_post_move(
    data: PostMoveRequest,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    """다른 게시판으로 옮기기 미리보기 (T-184) — 아무것도 바꾸지 않는다."""
    return ApiResponse.ok(
        PostMovePreview(**await move_service.preview(db, tenant_id, data))
    )


@posts_router.post("/move", response_model=ApiResponse[PostMoveResult])
async def move_posts(
    data: PostMoveRequest,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
    current_user: User = Depends(get_current_user),
):
    result = await move_service.move(db, tenant_id, data, current_user)
    return ApiResponse.ok(PostMoveResult(**result))


# ── 신고된 글 (T-151-B) ──────────────────────────────────────────────────


@posts_router.get("/reports", response_model=ApiResponse[list[ReportedPostItem]])
async def list_reported_posts(
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
):
    items = await report_service.list_reported(db, tenant_id)
    return ApiResponse.ok([ReportedPostItem(**item) for item in items])


@posts_router.post("/{post_id}/reports/resolve", response_model=ApiResponse[dict])
async def resolve_reports(
    post_id: UUID,
    data: ReportResolveRequest,
    db: AsyncSession = Depends(get_db_with_rls),
    tenant_id: UUID = Depends(get_tenant_id),
    current_user: User = Depends(get_current_user),
):
    post = await report_service.resolve(db, tenant_id, post_id, data.action)
    await log_action(
        db,
        current_user,
        f"POST_REPORTS_{data.action}",
        "board_post",
        post.id,
        after={"title": post.title, "status": post.status},
        tenant_id=tenant_id,
    )
    return ApiResponse.ok({"resolved": True, "status": post.status})


@public_router.get(
    "/site/{tenant_slug}/sitemap-posts",
    response_model=ApiResponse[list[PublicSitemapPost]],
)
async def list_sitemap_posts(tenant_slug: str, db: AsyncSession = Depends(get_db)):
    posts = await board_service.list_sitemap_posts(db, tenant_slug)
    if posts is None:
        raise _not_found(MSG_BOARD_NOT_FOUND)
    return ApiResponse.ok([PublicSitemapPost(**post) for post in posts])


@public_router.get(
    "/site/{tenant_slug}/posts/{post_id}/location",
    response_model=ApiResponse[PublicPostLocation],
)
async def get_public_post_location(
    tenant_slug: str, post_id: UUID, db: AsyncSession = Depends(get_db)
):
    """공개 글이 지금 있는 게시판 (T-184) — 옮긴 글의 예전 주소를 새 주소로 보낸다."""
    found = await board_service.public_post_location(db, tenant_slug, post_id)
    if found is None:
        raise _not_found(MSG_POST_NOT_FOUND)
    return ApiResponse.ok(PublicPostLocation(**found))


async def _open_readable_board(
    db: AsyncSession,
    tenant_slug: str,
    board_slug: str,
    credentials: HTTPAuthorizationCredentials | None,
    response: Response,
) -> Board:
    """공개 게시판 — 회원만 읽기면 회원 토큰을 검사하고 캐시하지 않게 한다 (T-150)."""
    board = await board_service.open_public_board(db, tenant_slug, board_slug)
    if board is None:
        raise _not_found(MSG_BOARD_NOT_FOUND)
    if board_service.is_member_only(board):
        response.headers["Cache-Control"] = board_access.PRIVATE_CACHE
        await board_access.ensure_member_reader(db, board, credentials)
    return board


@public_router.get(
    "/site/{tenant_slug}/boards/{board_slug}/posts",
    response_model=ApiResponse[PublicPostListResponse],
)
async def list_public_posts(
    tenant_slug: str,
    board_slug: str,
    response: Response,
    page: int = Query(default=1, ge=1),
    size: int | None = Query(default=None, ge=1, le=50),
    q: str | None = Query(default=None, max_length=100),
    order: Literal["default", "latest"] = "default",
    category: UUID | None = None,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
):
    board = await _open_readable_board(
        db, tenant_slug, board_slug, credentials, response
    )
    # 크기를 안 보내면 게시판 설정대로 (T-146)
    size = size or board_service.public_page_size(board)
    posts, total, has_posts = await board_service.list_public_posts(
        db,
        board,
        page=page,
        size=size,
        q=q,
        latest=order == "latest",
        category_id=category,
    )
    list_fields = await field_service.list_display_fields(db, board)
    attached = await attachment_service.posts_with_attachments(
        db, [p.id for p in posts if not p.is_secret]
    )
    return ApiResponse.ok(
        PublicPostListResponse(
            list_columns=(
                [PublicListColumn.model_validate(column) for column in columns]
                if (columns := board_service.public_list_columns(board, list_fields))
                is not None
                else None
            ),
            total=total,
            page=page,
            size=size,
            has_posts=has_posts,
            items=[
                PublicPostItem(
                    **board_service.public_post_item(board, p, list_fields),
                    has_attachments=p.id in attached,
                )
                for p in posts
            ],
        )
    )


@public_router.get(
    "/site/{tenant_slug}/boards/{board_slug}/posts/{post_id}",
    response_model=ApiResponse[PublicPostDetail],
)
async def get_public_post(
    tenant_slug: str,
    board_slug: str,
    post_id: UUID,
    response: Response,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
):
    board = await _open_readable_board(
        db, tenant_slug, board_slug, credentials, response
    )
    found = await board_service.get_public_post(db, board, post_id)
    if found is None:
        raise _not_found(MSG_POST_NOT_FOUND)
    post, prev_id, next_id = found
    # 비밀글 (T-151-A) — 작성 회원이 아니면 제목만. 내용이 담긴 응답은 캐시하지 않는다
    locked = False
    if post.is_secret:
        member = await board_access.optional_member(db, board, credentials)
        locked = member is None or post.author_member_id != member.id
        if not locked:
            response.headers["Cache-Control"] = board_access.PRIVATE_CACHE
    return ApiResponse.ok(
        PublicPostDetail(
            id=post.id,
            title=post.title,
            is_pinned=post.is_pinned,
            is_secret=post.is_secret,
            is_guest=post.guest_password_hash is not None,
            locked=locked,
            published_at=post.published_at,  # type: ignore[arg-type]
            category_id=post.category_id,
            body=[] if locked else post.body,
            fields=[] if locked else await field_service.public_fields(db, post),  # type: ignore[arg-type]
            attachments=[]
            if locked
            else [
                PostAttachment(**item)
                for item in await attachment_service.list_attachments(db, post.id)
            ],
            prev_id=prev_id,
            next_id=next_id,
        )
    )


# ── 홈페이지 회원 글쓰기 (T-150-B) ───────────────────────────────────────


async def _open_board(db: AsyncSession, tenant_slug: str, board_slug: str) -> Board:
    board = await board_service.open_public_board(db, tenant_slug, board_slug)
    if board is None:
        raise _not_found(MSG_BOARD_NOT_FOUND)
    return board


@public_router.post(
    "/site/{tenant_slug}/boards/{board_slug}/posts",
    response_model=ApiResponse[MemberPostResponse],
    status_code=status.HTTP_201_CREATED,
)
async def create_member_post(
    tenant_slug: str,
    board_slug: str,
    data: MemberPostCreate,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
):
    board = await _open_board(db, tenant_slug, board_slug)
    member = await board_access.member_writer(db, board, credentials)
    post = await member_post_service.create_post(db, board, member, data)
    return ApiResponse.ok(
        MemberPostResponse(**member_post_service.member_post_response(post))
    )


@public_router.get(
    "/site/{tenant_slug}/boards/{board_slug}/posts/{post_id}/mine",
    response_model=ApiResponse[MemberPostResponse],
)
async def get_member_post(
    tenant_slug: str,
    board_slug: str,
    post_id: UUID,
    response: Response,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
):
    """내가 쓴 글이면 고치기 화면 값, 아니면 404.

    홈페이지가 [수정] [삭제] 를 보일지 이것으로 정한다.
    """
    response.headers["Cache-Control"] = board_access.PRIVATE_CACHE
    board = await _open_board(db, tenant_slug, board_slug)
    member = await board_access.post_owner(db, board, credentials)
    post = await member_post_service.own_post(db, board, member, post_id)
    return ApiResponse.ok(
        MemberPostResponse(**member_post_service.member_post_response(post))
    )


@public_router.patch(
    "/site/{tenant_slug}/boards/{board_slug}/posts/{post_id}",
    response_model=ApiResponse[MemberPostResponse],
)
async def update_member_post(
    tenant_slug: str,
    board_slug: str,
    post_id: UUID,
    data: MemberPostUpdate,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
):
    board = await _open_board(db, tenant_slug, board_slug)
    member = await board_access.member_writer(db, board, credentials)
    post = await member_post_service.own_post(db, board, member, post_id)
    updated = await member_post_service.update_post(db, board, post, data)
    return ApiResponse.ok(
        MemberPostResponse(**member_post_service.member_post_response(updated))
    )


@public_router.delete(
    "/site/{tenant_slug}/boards/{board_slug}/posts/{post_id}",
    response_model=ApiResponse[dict],
)
async def delete_member_post(
    tenant_slug: str,
    board_slug: str,
    post_id: UUID,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
):
    """자기 글은 회원 글쓰기를 꺼도 지울 수 있다."""
    board = await _open_board(db, tenant_slug, board_slug)
    member = await board_access.post_owner(db, board, credentials)
    post = await member_post_service.own_post(db, board, member, post_id)
    await member_post_service.delete_post(db, post)
    return ApiResponse.ok({"deleted": True})


# ── 비회원 글쓰기 · 신고 (T-151-B) ─────────────────────────────────────


async def _guest_response(db: AsyncSession, post: BoardPost) -> GuestPostResponse:
    return GuestPostResponse(**await guest_post_service.guest_post_response(db, post))


@public_router.post(
    "/site/{tenant_slug}/boards/{board_slug}/posts/guest",
    response_model=ApiResponse[GuestPostResponse],
    status_code=status.HTTP_201_CREATED,
)
async def create_guest_post(
    tenant_slug: str,
    board_slug: str,
    data: GuestPostCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    board = await _open_board(db, tenant_slug, board_slug)
    post = await guest_post_service.create_post(db, board, data, client_ip(request))
    return ApiResponse.ok(await _guest_response(db, post))


@public_router.post(
    "/site/{tenant_slug}/boards/{board_slug}/posts/{post_id}/guest/verify",
    response_model=ApiResponse[GuestPostResponse],
)
async def verify_guest_post(
    tenant_slug: str,
    board_slug: str,
    post_id: UUID,
    data: GuestPasswordRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """글 비밀번호 확인 — 맞으면 고치기 값과 본문(비밀글도). 캐시하지 않는다."""
    response.headers["Cache-Control"] = board_access.PRIVATE_CACHE
    board = await _open_board(db, tenant_slug, board_slug)
    post = await guest_post_service.guest_post(
        db, board, post_id, data.password, client_ip(request)
    )
    return ApiResponse.ok(await _guest_response(db, post))


@public_router.patch(
    "/site/{tenant_slug}/boards/{board_slug}/posts/{post_id}/guest",
    response_model=ApiResponse[GuestPostResponse],
)
async def update_guest_post(
    tenant_slug: str,
    board_slug: str,
    post_id: UUID,
    data: GuestPostUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    board = await _open_board(db, tenant_slug, board_slug)
    post = await guest_post_service.guest_post(
        db, board, post_id, data.password, client_ip(request)
    )
    updated = await guest_post_service.update_post(db, board, post, data)
    return ApiResponse.ok(await _guest_response(db, updated))


@public_router.post(
    "/site/{tenant_slug}/boards/{board_slug}/posts/{post_id}/guest/delete",
    response_model=ApiResponse[dict],
)
async def delete_guest_post(
    tenant_slug: str,
    board_slug: str,
    post_id: UUID,
    data: GuestPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    board = await _open_board(db, tenant_slug, board_slug)
    post = await guest_post_service.guest_post(
        db, board, post_id, data.password, client_ip(request)
    )
    await guest_post_service.delete_post(db, post)
    return ApiResponse.ok({"deleted": True})


@public_router.post(
    "/site/{tenant_slug}/boards/{board_slug}/posts/{post_id}/report",
    response_model=ApiResponse[dict],
    status_code=status.HTTP_201_CREATED,
)
async def report_post(
    tenant_slug: str,
    board_slug: str,
    post_id: UUID,
    data: ReportCreate,
    request: Request,
    response: Response,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
):
    """누구나 신고한다 — 회원만 읽는 게시판은 회원만. 같은 사람은 한 글에 한 번."""
    board = await _open_readable_board(
        db, tenant_slug, board_slug, credentials, response
    )
    member = await board_access.optional_member(db, board, credentials)
    ip_key = guest_post_service.visitor_key("ip", client_ip(request))
    reporter_key = (
        guest_post_service.visitor_key("member", str(member.id)) if member else ip_key
    )
    hidden = await report_service.report_post(
        db, board, post_id, data, reporter_key, ip_key
    )
    return ApiResponse.ok({"reported": True, "hidden": hidden})
