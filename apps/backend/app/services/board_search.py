"""전체 글 본문 검색 — 저장된 글자만 문단별로 찾는다 (T-170)."""

from sqlalchemy import text
from sqlalchemy.sql.elements import TextClause

# strict 재귀 탐색으로 중복 자동 펼침 없이 중첩 표/목록/인용의 문단도 찾는다.
_BODY_BLOCK_PATH = (
    'strict $.** ? (@.type == "paragraph" || @.type == "heading"'
    ' || @.type == "p" || @.type == "ul")'
)


def body_contains(keyword: str) -> TextClause:
    """문단의 인라인 글자는 순서대로 연결하고 줄/목록 항목 경계는 남긴다.

    SQL에서 처리해 전체 글을 Python으로 읽지 않고 count/페이지에 같은 조건을 쓴다.
    경로는 상수, 검색어는 LIKE 글자 이스케이프 후 바인딩한다. URL/속성은 읽지 않는다.
    """
    escaped = keyword.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return text(
        r"""
        EXISTS (
          SELECT 1
          FROM jsonb_path_query(board_posts.body, CAST(:body_search_path AS jsonpath))
               AS block(value)
          WHERE (CASE block.value->>'type'
            WHEN 'p' THEN regexp_replace(
              block.value->>'text', '\*\*([^*]+)\*\*', '\1', 'g')
            WHEN 'ul' THEN (
              SELECT string_agg(
                regexp_replace(item.value, '\*\*([^*]+)\*\*', '\1', 'g'),
                E'\n' ORDER BY item.position)
              FROM jsonb_array_elements_text(block.value->'items')
                   WITH ORDINALITY AS item(value, position)
            )
            ELSE (
              SELECT string_agg(
                CASE child.value->>'type'
                  WHEN 'text' THEN child.value->>'text'
                  WHEN 'hardBreak' THEN E'\n'
                  ELSE ''
                END, '' ORDER BY child.position)
              FROM jsonb_array_elements(COALESCE(block.value->'content', '[]'::jsonb))
                   WITH ORDINALITY AS child(value, position)
            )
          END) ILIKE :body_search_pattern ESCAPE E'\\'
        )
        """
    ).bindparams(body_search_path=_BODY_BLOCK_PATH, body_search_pattern=f"%{escaped}%")
