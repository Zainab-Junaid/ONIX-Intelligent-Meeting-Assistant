"use client"

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { Toggle } from "@/components/ui/toggle"
import { 
  Bold, 
  Italic, 
  Underline as UnderlineIcon, 
  AlignLeft, 
  AlignCenter, 
  AlignRight,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Undo,
  Redo
} from 'lucide-react'
import { useEffect } from 'react'

interface RichTextEditorProps {
  content: string
  onChange: (content: string) => void
  editable?: boolean
}

export function RichTextEditor({ content, onChange, editable = true }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
    ],
    content,
    editable,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[300px] px-4 py-3',
      },
    },
  })

  // Update content if it changes externally (e.g. initial load)
  useEffect(() => {
    if (editor && content && editor.getHTML() !== content) {
       // Only set content if it's different to avoid cursor jumping
       // editor.commands.setContent(content) 
       // Note: Setting content on every prop change can be tricky with collaborative editing or fast typing.
       // For this simple use case, we might rely on initial content or careful handling.
       // Let's assume initial load for now.
       if (editor.isEmpty && content) {
          editor.commands.setContent(content)
       }
    }
  }, [content, editor])

  if (!editor) {
    return null
  }

  return (
    <div className="border rounded-md bg-white overflow-hidden">
      {editable && (
        <div className="border-b bg-muted/30 p-1 flex flex-wrap gap-1 items-center">
          <Toggle
            size="sm"
            pressed={editor.isActive('bold')}
            onPressedChange={() => editor.chain().focus().toggleBold().run()}
            aria-label="Toggle bold"
          >
            <Bold className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive('italic')}
            onPressedChange={() => editor.chain().focus().toggleItalic().run()}
            aria-label="Toggle italic"
          >
            <Italic className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive('underline')}
            onPressedChange={() => editor.chain().focus().toggleUnderline().run()}
            aria-label="Toggle underline"
          >
            <UnderlineIcon className="h-4 w-4" />
          </Toggle>
          
          <div className="w-px h-6 bg-border mx-1" />

          <Toggle
            size="sm"
            pressed={editor.isActive('heading', { level: 1 })}
            onPressedChange={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            aria-label="Heading 1"
          >
            <Heading1 className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive('heading', { level: 2 })}
            onPressedChange={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            aria-label="Heading 2"
          >
            <Heading2 className="h-4 w-4" />
          </Toggle>
           <Toggle
            size="sm"
            pressed={editor.isActive('heading', { level: 3 })}
            onPressedChange={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            aria-label="Heading 3"
          >
            <Heading3 className="h-4 w-4" />
          </Toggle>

          <div className="w-px h-6 bg-border mx-1" />

          <Toggle
            size="sm"
            pressed={editor.isActive('bulletList')}
            onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
            aria-label="Bullet list"
          >
            <List className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive('orderedList')}
            onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
            aria-label="Ordered list"
          >
            <ListOrdered className="h-4 w-4" />
          </Toggle>

          <div className="w-px h-6 bg-border mx-1" />

          <Toggle
            size="sm"
            pressed={editor.isActive({ textAlign: 'left' })}
            onPressedChange={() => editor.chain().focus().setTextAlign('left').run()}
            aria-label="Align left"
          >
            <AlignLeft className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive({ textAlign: 'center' })}
            onPressedChange={() => editor.chain().focus().setTextAlign('center').run()}
            aria-label="Align center"
          >
            <AlignCenter className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive({ textAlign: 'right' })}
            onPressedChange={() => editor.chain().focus().setTextAlign('right').run()}
            aria-label="Align right"
          >
            <AlignRight className="h-4 w-4" />
          </Toggle>

          <div className="w-px h-6 bg-border mx-1" />

          <Toggle
            size="sm"
            onPressedChange={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            aria-label="Undo"
          >
            <Undo className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            onPressedChange={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            aria-label="Redo"
          >
            <Redo className="h-4 w-4" />
          </Toggle>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  )
}
