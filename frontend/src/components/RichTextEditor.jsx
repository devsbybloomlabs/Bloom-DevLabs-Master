/**
 * RichTextEditor — TipTap-based WYSIWYG used in the admin brief dialog.
 *
 * Outputs sanitised HTML (server re-sanitises on write via bleach).
 * Read-only mode (when `readOnly` is true) renders the HTML as a prose block
 * without the toolbar — useful for surfacing summaries inside the client
 * portal.
 */
import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import { Button } from "@/components/ui/button";
import {
  Bold,
  Italic,
  Strikethrough,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Undo,
  Redo,
} from "lucide-react";

function ToolbarButton({ active, onClick, children, label, dataTestId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      title={label}
      data-testid={dataTestId}
      className={`p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors ${
        active ? "bg-primary/10 text-primary" : ""
      }`}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Paste Claude's summary here…",
  readOnly = false,
  dataTestId,
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: false, // disabled to avoid duplicate w/ explicit @tiptap/extension-link below
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Placeholder.configure({ placeholder }),
      // Auto-convert markdown-style paste (Claude output) into rich formatting
      // — turns `- bullet`, `## heading`, `**bold**` into real DOM nodes
      // instead of leaving them as plain text inside one big <p>.
      Markdown.configure({
        html: true,
        tightLists: true,
        breaks: true,
        transformPastedText: true,
        transformCopiedText: false,
      }),
    ],
    content: value || "",
    editable: !readOnly,
    onUpdate: ({ editor: e }) => {
      onChange?.(e.getHTML());
    },
  });

  // Keep external value in sync when the parent passes a fresh one
  // (e.g. switching phase tabs).
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if ((value || "") !== current) {
      editor.commands.setContent(value || "", false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) return null;

  const addLink = () => {
    const prev = editor.getAttributes("link").href || "";
    const url = window.prompt("Link URL", prev);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url })
      .run();
  };

  if (readOnly) {
    return (
      <div
        className="tiptap-rendered max-w-none"
        data-testid={dataTestId}
      >
        <EditorContent editor={editor} />
        <style>{`
          .tiptap-rendered .ProseMirror { outline: none; font-size: 14px; line-height: 1.65; color: hsl(var(--foreground)); }
          .tiptap-rendered .ProseMirror p { margin: 0.5em 0; }
          .tiptap-rendered .ProseMirror strong { font-weight: 600; color: hsl(var(--foreground)); }
          .tiptap-rendered .ProseMirror em { font-style: italic; }
          .tiptap-rendered .ProseMirror h2 { font-family: var(--font-display, inherit); font-size: 1.25rem; font-weight: 600; margin: 1.1em 0 0.4em; }
          .tiptap-rendered .ProseMirror h3 { font-family: var(--font-display, inherit); font-size: 1.05rem; font-weight: 600; margin: 0.9em 0 0.3em; }
          .tiptap-rendered .ProseMirror ul { list-style: disc; padding-left: 1.4rem; margin: 0.5em 0; }
          .tiptap-rendered .ProseMirror ol { list-style: decimal; padding-left: 1.4rem; margin: 0.5em 0; }
          .tiptap-rendered .ProseMirror li { margin: 0.15em 0; }
          .tiptap-rendered .ProseMirror li > p { margin: 0; }
          .tiptap-rendered .ProseMirror blockquote {
            border-left: 3px solid hsl(var(--primary, 220 60% 30%));
            padding: 0.25em 0 0.25em 0.75em;
            color: hsl(var(--muted-foreground));
            font-style: italic;
            margin: 0.6em 0;
          }
          .tiptap-rendered .ProseMirror a { color: hsl(var(--primary, 220 60% 30%)); text-decoration: underline; }
          .tiptap-rendered .ProseMirror code {
            background: rgba(0,0,0,0.06);
            padding: 0.1em 0.35em;
            border-radius: 4px;
            font-size: 0.88em;
          }
          .tiptap-rendered .ProseMirror pre {
            background: rgba(0,0,0,0.04);
            padding: 0.7em 0.9em;
            border-radius: 6px;
            font-size: 0.85em;
            overflow-x: auto;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div
      className="rounded-md border border-border bg-background overflow-hidden"
      data-testid={dataTestId}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-secondary/30 px-2 py-1.5">
        <ToolbarButton
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          label="Bold"
          dataTestId="rt-bold"
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          label="Italic"
          dataTestId="rt-italic"
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          label="Strikethrough"
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>
        <span className="mx-1 h-4 w-px bg-border" />
        <ToolbarButton
          active={editor.isActive("heading", { level: 2 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          label="Heading 2"
        >
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("heading", { level: 3 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
          label="Heading 3"
        >
          <Heading3 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <span className="mx-1 h-4 w-px bg-border" />
        <ToolbarButton
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          label="Bulleted list"
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          label="Numbered list"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          label="Quote"
        >
          <Quote className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("link")}
          onClick={addLink}
          label="Link"
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        <span className="ml-auto flex items-center gap-0.5">
          <ToolbarButton onClick={() => editor.chain().focus().undo().run()} label="Undo">
            <Undo className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().redo().run()} label="Redo">
            <Redo className="h-3.5 w-3.5" />
          </ToolbarButton>
        </span>
      </div>
      <EditorContent
        editor={editor}
        className="tiptap-edit max-w-none px-3 py-2.5 min-h-[160px] focus:outline-none"
      />
      <style>{`
        .tiptap-edit .ProseMirror { outline: none; min-height: 140px; font-size: 14px; line-height: 1.65; color: hsl(var(--foreground)); }
        .tiptap-edit .ProseMirror p { margin: 0.5em 0; }
        .tiptap-edit .ProseMirror strong { font-weight: 600; }
        .tiptap-edit .ProseMirror em { font-style: italic; }
        .tiptap-edit .ProseMirror h2 { font-family: var(--font-display, inherit); font-size: 1.25rem; font-weight: 600; margin: 1.1em 0 0.4em; }
        .tiptap-edit .ProseMirror h3 { font-family: var(--font-display, inherit); font-size: 1.05rem; font-weight: 600; margin: 0.9em 0 0.3em; }
        .tiptap-edit .ProseMirror ul { list-style: disc; padding-left: 1.4rem; margin: 0.5em 0; }
        .tiptap-edit .ProseMirror ol { list-style: decimal; padding-left: 1.4rem; margin: 0.5em 0; }
        .tiptap-edit .ProseMirror li { margin: 0.15em 0; }
        .tiptap-edit .ProseMirror li > p { margin: 0; }
        .tiptap-edit .ProseMirror blockquote {
          border-left: 3px solid hsl(var(--primary, 220 60% 30%));
          padding: 0.25em 0 0.25em 0.75em;
          color: hsl(var(--muted-foreground));
          font-style: italic;
          margin: 0.6em 0;
        }
        .tiptap-edit .ProseMirror a { color: hsl(var(--primary, 220 60% 30%)); text-decoration: underline; }
        .tiptap-edit .ProseMirror code {
          background: rgba(0,0,0,0.06);
          padding: 0.1em 0.35em;
          border-radius: 4px;
          font-size: 0.88em;
        }
        .tiptap-edit .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          color: hsl(var(--muted-foreground));
          float: left;
          height: 0;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}

export default RichTextEditor;
