"""업종별 문의 폼 칸 (T-051-A, 기획서 16.2).

업종(tenants.template_type)마다 문의 폼에 더 보여 줄 칸과 문의 유형을 한곳에 둔다.
- 홈페이지 문의 폼은 `fields_for()` 결과(공개 API)대로 칸을 그린다
- 접수 시 `clean_detail()` 이 값을 검사해 inquiries.detail 에 저장한다
  (정의에 없는 칸은 버리고, 선택지 밖 · 형식이 틀린 값은 InquiryFieldError)
"""

from dataclasses import dataclass, field
from datetime import date
from typing import Any, Literal

FieldType = Literal["select", "multiselect", "text", "date", "number"]

TEXT_MAX_LENGTH = 100
MULTISELECT_MAX = 10

MSG_INVALID_OPTION = "선택할 수 없는 값입니다."
MSG_INVALID_TEXT = f"{TEXT_MAX_LENGTH}자 이하로 입력해주세요."
MSG_INVALID_DATE = "올바른 날짜가 아닙니다."
MSG_INVALID_NUMBER = "올바른 숫자가 아닙니다."
MSG_TOO_MANY = f"최대 {MULTISELECT_MAX}개까지 선택할 수 있습니다."
MSG_CHECKOUT_ORDER = "체크아웃은 체크인 다음 날 이후여야 합니다."


class InquiryFieldError(ValueError):
    """detail 값 검증 실패 — field 는 `detail.<칸 이름>`."""

    def __init__(self, key: str, message: str) -> None:
        super().__init__(message)
        self.field = f"detail.{key}"
        self.message = message


@dataclass(frozen=True)
class FieldOption:
    value: str
    label: str


@dataclass(frozen=True)
class InquiryField:
    key: str
    label: str
    type: FieldType
    options: tuple[FieldOption, ...] = ()
    min: int | None = None
    max: int | None = None
    placeholder: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "label": self.label,
            "type": self.type,
            "options": [{"value": o.value, "label": o.label} for o in self.options],
            "min": self.min,
            "max": self.max,
            "max_length": TEXT_MAX_LENGTH if self.type == "text" else None,
            "max_selected": MULTISELECT_MAX if self.type == "multiselect" else None,
            "placeholder": self.placeholder,
        }


@dataclass(frozen=True)
class IndustryForm:
    inquiry_types: tuple[FieldOption, ...]
    fields: tuple[InquiryField, ...] = field(default=())


def _opts(*pairs: tuple[str, str]) -> tuple[FieldOption, ...]:
    return tuple(FieldOption(v, label) for v, label in pairs)


_GENERAL_TYPE = ("GENERAL", "일반 문의")
_RESERVATION_TYPE = ("RESERVATION", "예약 문의")

_HOSPITAL = IndustryForm(
    inquiry_types=_opts(_GENERAL_TYPE, _RESERVATION_TYPE, ("SYMPTOM", "증상 문의")),
    fields=(
        InquiryField(
            "department",
            "진료과",
            "select",
            _opts(
                ("INTERNAL", "내과"),
                ("SURGERY", "외과"),
                ("ORTHOPEDICS", "정형외과"),
                ("DERMATOLOGY", "피부과"),
                ("DENTAL", "치과"),
                ("PEDIATRICS", "소아청소년과"),
                ("OBSTETRICS", "산부인과"),
                ("OPHTHALMOLOGY", "안과"),
                ("ENT", "이비인후과"),
                ("OTHER", "기타"),
            ),
        ),
        InquiryField(
            "visit_type",
            "초진/재진",
            "select",
            _opts(("FIRST", "초진 (처음 방문)"), ("RETURN", "재진 (방문한 적 있음)")),
        ),
        InquiryField(
            "symptoms",
            "증상",
            "multiselect",
            _opts(
                ("PAIN", "통증"),
                ("FEVER", "발열"),
                ("COLD", "기침 · 감기"),
                ("DIGESTION", "소화 불량"),
                ("SKIN", "피부 트러블"),
                ("CHECKUP", "검진 상담"),
                ("OTHER", "기타"),
            ),
        ),
    ),
)

_PENSION = IndustryForm(
    inquiry_types=_opts(_GENERAL_TYPE, _RESERVATION_TYPE),
    fields=(
        InquiryField("check_in", "체크인", "date"),
        InquiryField("check_out", "체크아웃", "date"),
        InquiryField("adults", "성인", "number", min=1, max=30),
        InquiryField("children", "아동", "number", min=0, max=30),
        InquiryField("room", "희망 객실", "text", placeholder="예: 오션뷰 A동"),
    ),
)

_BUSINESS = IndustryForm(
    inquiry_types=_opts(_GENERAL_TYPE),
    fields=(
        InquiryField("company", "회사명", "text"),
        InquiryField(
            "topic",
            "문의 분야",
            "select",
            _opts(
                ("PARTNERSHIP", "제휴 · 협업"),
                ("QUOTE", "견적 문의"),
                ("RECRUIT", "채용"),
                ("OTHER", "기타"),
            ),
        ),
    ),
)

_FORMS: dict[str, IndustryForm] = {
    "HOSPITAL": _HOSPITAL,
    "PENSION": _PENSION,
    "STARTUP": _BUSINESS,
}


def form_for(template_type: str | None) -> IndustryForm:
    """업종 폼 — 등록되지 않은 업종(GENERAL 등)은 일반 업무 폼."""
    return _FORMS.get((template_type or "").upper(), _BUSINESS)


def fields_for(template_type: str | None) -> dict[str, Any]:
    """공개 API 응답 — 문의 유형 선택지와 추가 칸 목록."""
    form = form_for(template_type)
    return {
        "inquiry_types": [
            {"value": o.value, "label": o.label} for o in form.inquiry_types
        ],
        "fields": [f.to_dict() for f in form.fields],
    }


def _clean_value(f: InquiryField, value: Any) -> Any:
    allowed = {o.value for o in f.options}
    if f.type == "select":
        if not isinstance(value, str) or value not in allowed:
            raise InquiryFieldError(f.key, MSG_INVALID_OPTION)
        return value
    if f.type == "multiselect":
        if not isinstance(value, list):
            raise InquiryFieldError(f.key, MSG_INVALID_OPTION)
        if len(value) > MULTISELECT_MAX:
            raise InquiryFieldError(f.key, MSG_TOO_MANY)
        if any(not isinstance(v, str) or v not in allowed for v in value):
            raise InquiryFieldError(f.key, MSG_INVALID_OPTION)
        return list(dict.fromkeys(value))  # 중복 제거 · 순서 유지
    if f.type == "text":
        if not isinstance(value, str) or len(value.strip()) > TEXT_MAX_LENGTH:
            raise InquiryFieldError(f.key, MSG_INVALID_TEXT)
        return value.strip()
    if f.type == "date":
        if not isinstance(value, str):
            raise InquiryFieldError(f.key, MSG_INVALID_DATE)
        try:
            return date.fromisoformat(value).isoformat()
        except ValueError as exc:
            raise InquiryFieldError(f.key, MSG_INVALID_DATE) from exc
    # number — bool 은 int 의 하위 타입이라 따로 막는다
    if isinstance(value, bool) or not isinstance(value, int):
        raise InquiryFieldError(f.key, MSG_INVALID_NUMBER)
    if (f.min is not None and value < f.min) or (f.max is not None and value > f.max):
        raise InquiryFieldError(f.key, f"{f.min}~{f.max} 사이로 입력해주세요.")
    return value


def clean_detail(
    template_type: str | None, detail: dict[str, Any] | None
) -> dict[str, Any]:
    """업종 정의대로 detail 을 검사 · 정리한다.

    - 정의에 없는 칸(다른 업종 칸 포함)은 저장하지 않는다
    - 빈 값(None · "" · [])은 입력하지 않은 것으로 보고 뺀다
    """
    if not detail:
        return {}
    cleaned: dict[str, Any] = {}
    for f in form_for(template_type).fields:
        value = detail.get(f.key)
        if value is None or value == "" or value == []:
            continue
        value = _clean_value(f, value)
        if value != "":
            cleaned[f.key] = value

    check_in, check_out = cleaned.get("check_in"), cleaned.get("check_out")
    if check_in and check_out and check_out <= check_in:
        raise InquiryFieldError("check_out", MSG_CHECKOUT_ORDER)
    return cleaned


def describe_detail(
    template_type: str | None, detail: dict[str, Any] | None
) -> list[dict[str, str]]:
    """관리자 표시용 — [{label, value}] (선택지 값은 이름으로, 정의 순서대로).

    업종이 바뀌었거나 정의에서 빠진 칸은 칸 이름 그대로 뒤에 붙인다 (값 유실 방지).
    """
    if not detail:
        return []
    items: list[dict[str, str]] = []
    known: set[str] = set()
    for f in form_for(template_type).fields:
        known.add(f.key)
        if f.key not in detail:
            continue
        labels = {o.value: o.label for o in f.options}
        value = detail[f.key]
        values = value if isinstance(value, list) else [value]
        text = ", ".join(labels.get(str(v), str(v)) for v in values)
        items.append({"label": f.label, "value": text})
    for key, value in detail.items():
        if key not in known:
            values = value if isinstance(value, list) else [value]
            items.append({"label": key, "value": ", ".join(str(v) for v in values)})
    return items
