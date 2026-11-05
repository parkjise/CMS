import { useEffect, useRef } from 'react'
import Image from '@tiptap/extension-image'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import { Color, TextStyle } from '@tiptap/extension-text-style'
import { type Editor, EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Eraser,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  type LucideIcon,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Table as TableIcon,
  Underline,
  Undo2,
} from 'lucide-react'
import type { BodyNode, RichNode } from '@cms/types'
import { toast } from '@cms/ui'
import { uploadImage } from '@/hooks/useUploadImage'
import { pickErrorMessage } from '@/lib/errorMessages'
import { checkImageFile } from '@/lib/imageFile'
import { fromEditorDoc, normalizeLink, toEditorDoc } from '@/lib/richBody'

interface RichTextEditorProps {
  /** 처음 내용 — 이후 값은 편집기가 갖고 onChange 로 알린다 */
  initial: BodyNode[]
  editable: boolean
  onChange: (body: RichNode[]) => void
}

const EXTENSIONS = [
  // 저장하지 않는 서식은 끈다 — 서버 허용 목록(schemas/rich_body.py)과 같아야 한다
  StarterKit.configure({
    heading: { levels: [2, 3] },
    code: false,
    codeBlock: false,
    link: { openOnClick: false, autolink: true },
  }),
  Image,
  TextStyle,
  Color,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
]

const CONTENT_CLASS = [
  'min-h-64 rounded-b-lg border border-t-0 border-slate-300 bg-white p-4 text-sm leading-relaxed text-slate-900 outline-none',
  '[&>*+*]:mt-3 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:text-lg [&_h3]:font-bold',
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5',
  '[&_a]:text-blue-600 [&_a]:underline',
  '[&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600',
  '[&_hr]:border-slate-300 [&_img]:max-w-full [&_img]:rounded-lg',
  '[&_table]:w-full [&_table]:border-collapse',
  '[&_td]:border [&_td]:border-slate-300 [&_td]:p-2 [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-50 [&_th]:p-2',
].join(' ')

interface ToolProps {
  label: string
  icon: LucideIcon
  active?: boolean
  disabled?: boolean
  onClick: () => void
}

function Tool({ label, icon: Icon, active, disabled, onClick }: ToolProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      // 누르는 동안 편집기 선택 영역이 풀리지 않게
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`rounded p-1.5 disabled:opacity-30 ${active ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  )
}

const TextTool = ({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick: () => void }) => (
  <button
    type="button"
    disabled={disabled}
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
    className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-40"
  >
    {label}
  </button>
)

const Divider = () => <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />

function Toolbar({ editor }: { editor: Editor }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      link: e.isActive('link'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      table: e.isActive('table'),
      left: e.isActive({ textAlign: 'left' }),
      center: e.isActive({ textAlign: 'center' }),
      right: e.isActive({ textAlign: 'right' }),
      color: (e.getAttributes('textStyle').color as string | undefined) ?? '#000000',
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  })
  const chain = () => editor.chain().focus()

  const setLink = () => {
    if (state.link) {
      chain().unsetLink().run()
      return
    }
    const input = window.prompt('연결할 주소를 입력하세요.', 'https://')
    if (input === null) return
    const href = normalizeLink(input)
    if (!href) {
      toast.error('쓸 수 없는 주소입니다.')
      return
    }
    chain().setLink({ href }).run()
  }

  const addImage = async (file: File | undefined) => {
    if (!file) return
    const problem = checkImageFile(file)
    if (problem) {
      toast.error(problem)
      return
    }
    try {
      const { url } = await uploadImage({ file, context: 'board' })
      const alt = window.prompt('사진 설명 (사진을 볼 수 없는 분께 읽어 줍니다)', '') ?? ''
      chain().setImage({ src: url, alt: alt.slice(0, 200) }).run()
    } catch (error) {
      toast.error(pickErrorMessage(error, '사진을 올리지 못했습니다.'))
    }
  }

  return (
    <div className="rounded-t-lg border border-slate-300 bg-slate-50 p-1.5" role="toolbar" aria-label="글 서식">
      <div className="flex flex-wrap items-center gap-0.5">
        <Tool label="큰 제목" icon={Heading2} active={state.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()} />
        <Tool label="작은 제목" icon={Heading3} active={state.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()} />
        <Divider />
        <Tool label="굵게" icon={Bold} active={state.bold} onClick={() => chain().toggleBold().run()} />
        <Tool label="기울임" icon={Italic} active={state.italic} onClick={() => chain().toggleItalic().run()} />
        <Tool label="밑줄" icon={Underline} active={state.underline} onClick={() => chain().toggleUnderline().run()} />
        <Tool label="취소선" icon={Strikethrough} active={state.strike} onClick={() => chain().toggleStrike().run()} />
        <label className="flex h-7 w-7 cursor-pointer items-center justify-center rounded hover:bg-slate-100" title="글자 색">
          <span className="sr-only">글자 색</span>
          <input
            type="color"
            className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
            value={state.color}
            onChange={(e) => chain().setColor(e.target.value).run()}
          />
        </label>
        <Tool label="글자 색 지우기" icon={Eraser} onClick={() => chain().unsetColor().run()} />
        <Divider />
        <Tool label="왼쪽 정렬" icon={AlignLeft} active={state.left} onClick={() => chain().setTextAlign('left').run()} />
        <Tool label="가운데 정렬" icon={AlignCenter} active={state.center} onClick={() => chain().setTextAlign('center').run()} />
        <Tool label="오른쪽 정렬" icon={AlignRight} active={state.right} onClick={() => chain().setTextAlign('right').run()} />
        <Divider />
        <Tool label="글머리 목록" icon={List} active={state.bullet} onClick={() => chain().toggleBulletList().run()} />
        <Tool label="번호 목록" icon={ListOrdered} active={state.ordered} onClick={() => chain().toggleOrderedList().run()} />
        <Tool label="인용" icon={Quote} active={state.quote} onClick={() => chain().toggleBlockquote().run()} />
        <Tool label="구분선" icon={Minus} onClick={() => chain().setHorizontalRule().run()} />
        <Divider />
        <Tool label={state.link ? '링크 해제' : '링크'} icon={LinkIcon} active={state.link} onClick={setLink} />
        <Tool label="사진" icon={ImageIcon} onClick={() => fileInput.current?.click()} />
        <Tool
          label="표"
          icon={TableIcon}
          active={state.table}
          disabled={state.table}
          onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        />
        <Divider />
        <Tool label="실행 취소" icon={Undo2} disabled={!state.canUndo} onClick={() => chain().undo().run()} />
        <Tool label="다시 실행" icon={Redo2} disabled={!state.canRedo} onClick={() => chain().redo().run()} />
      </div>
      {state.table && (
        <div className="mt-1.5 flex flex-wrap gap-1" role="group" aria-label="표 편집">
          <TextTool label="행 추가" onClick={() => chain().addRowAfter().run()} />
          <TextTool label="행 삭제" onClick={() => chain().deleteRow().run()} />
          <TextTool label="열 추가" onClick={() => chain().addColumnAfter().run()} />
          <TextTool label="열 삭제" onClick={() => chain().deleteColumn().run()} />
          <TextTool label="표 삭제" onClick={() => chain().deleteTable().run()} />
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        aria-label="본문 사진 파일"
        className="hidden"
        onChange={(e) => {
          void addImage(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}

/** 글 본문 편집기 (T-143, 게시판 모듈 기획서 10장) — 저장 값은 HTML 이 아닌 노드 목록 */
export function RichTextEditor({ initial, editable, onChange }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: EXTENSIONS,
    content: toEditorDoc(initial),
    editable,
    editorProps: { attributes: { class: CONTENT_CLASS, 'aria-label': '내용', role: 'textbox', 'aria-multiline': 'true' } },
    onUpdate: ({ editor: e }) => onChange(fromEditorDoc(e.getJSON() as RichNode)),
  })

  useEffect(() => {
    editor?.setEditable(editable)
  }, [editor, editable])

  // 기존 글을 그대로 저장해도 새 형식으로 보내도록, 처음 값도 한 번 알린다
  useEffect(() => {
    if (editor) onChange(fromEditorDoc(editor.getJSON() as RichNode))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 처음 한 번만
  }, [editor])

  if (!editor) return <div className="h-64 animate-pulse rounded-lg bg-slate-100" />

  return (
    <div>
      {editable && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  )
}
