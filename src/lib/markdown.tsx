import { Fragment, type ReactNode } from "react";

// Minimal markdown → React renderer for blog posts. Dependency-free and safe
// by construction: output is React elements, never raw HTML, and URLs are
// scheme-whitelisted. Covers the subset editors actually use — headings,
// paragraphs, lists, blockquotes, fenced code, hr, bold/italic/code/links/
// images. Swap for react-markdown if the blog ever needs full CommonMark.

function safeHref(url: string): string | null {
  const u = url.trim();
  if (/^(https?:|mailto:)/i.test(u)) return u;
  if (u.startsWith("/") && !u.startsWith("//")) return u;
  return null;
}

function safeSrc(url: string): string | null {
  const u = url.trim();
  if (/^https?:/i.test(u)) return u;
  if (u.startsWith("/") && !u.startsWith("//")) return u;
  return null;
}

// Inline: images, links, bold, italic, code. Single-pass tokenizer keyed on
// the first matching marker so nesting order stays predictable.
const INLINE_RE =
  /(!\[([^\]]*)\]\(([^)\s]+)\))|(\[([^\]]+)\]\(([^)\s]+)\))|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(_([^_]+)_)|(`([^`]+)`)/;

function renderInline(text: string, key = 0): ReactNode {
  const m = INLINE_RE.exec(text);
  if (!m) return text;
  const before = text.slice(0, m.index);
  const after = text.slice(m.index + m[0].length);
  let node: ReactNode = m[0];
  if (m[1]) {
    const src = safeSrc(m[3]);
    node = src ? <img src={src} alt={m[2]} className="my-4 max-w-full rounded-xl" loading="lazy" /> : m[2];
  } else if (m[4]) {
    const href = safeHref(m[6]);
    node = href ? (
      <a href={href} className="text-brand underline underline-offset-2 hover:opacity-80" rel="noopener">
        {renderInline(m[5], key + 1)}
      </a>
    ) : (
      m[5]
    );
  } else if (m[7]) {
    node = <strong>{renderInline(m[8], key + 1)}</strong>;
  } else if (m[9]) {
    node = <em>{renderInline(m[10], key + 1)}</em>;
  } else if (m[11]) {
    node = <em>{renderInline(m[12], key + 1)}</em>;
  } else if (m[13]) {
    node = <code className="rounded bg-secondary px-1.5 py-0.5 text-[0.9em]">{m[14]}</code>;
  }
  return (
    <Fragment key={key}>
      {before}
      {node}
      {after ? renderInline(after, key + 1) : null}
    </Fragment>
  );
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    // Fenced code block
    if (line.startsWith("```")) {
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1; // closing fence
      blocks.push(
        <pre key={key++} className="my-4 overflow-x-auto rounded-xl bg-secondary/70 p-4 text-sm">
          <code>{buf.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // Heading
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const cls =
        level === 1
          ? "mt-8 mb-3 font-display text-3xl font-bold"
          : level === 2
            ? "mt-8 mb-3 font-display text-2xl font-bold"
            : "mt-6 mb-2 font-display text-xl font-semibold";
      const Tag = (level <= 2 ? `h${level + 1}` : "h4") as "h2" | "h3" | "h4"; // page h1 is the post title
      blocks.push(<Tag key={key++} className={cls}>{renderInline(h[2])}</Tag>);
      i += 1;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      blocks.push(<hr key={key++} className="my-8 border-border" />);
      i += 1;
      continue;
    }

    // Blockquote
    if (line.startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push(
        <blockquote key={key++} className="my-4 border-l-4 border-brand/40 pl-4 italic text-muted-foreground">
          {renderInline(buf.join(" "))}
        </blockquote>,
      );
      continue;
    }

    // Lists
    const isUl = (s: string) => /^\s*[-*]\s+/.test(s);
    const isOl = (s: string) => /^\s*\d+\.\s+/.test(s);
    if (isUl(line) || isOl(line)) {
      const ordered = isOl(line);
      const match = ordered ? isOl : isUl;
      const items: ReactNode[] = [];
      while (i < lines.length && match(lines[i])) {
        items.push(
          <li key={items.length}>{renderInline(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""))}</li>,
        );
        i += 1;
      }
      const cls = "my-4 space-y-1.5 pl-6 " + (ordered ? "list-decimal" : "list-disc");
      blocks.push(
        ordered ? <ol key={key++} className={cls}>{items}</ol> : <ul key={key++} className={cls}>{items}</ul>,
      );
      continue;
    }

    // Paragraph: consume until blank line or a block marker
    const buf: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith("```") &&
      !/^(#{1,6})\s/.test(lines[i]) &&
      !lines[i].startsWith(">") &&
      !isUl(lines[i]) &&
      !isOl(lines[i]) &&
      !/^(-{3,}|\*{3,})$/.test(lines[i].trim())
    ) {
      buf.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={key++} className="my-4 leading-relaxed">
        {renderInline(buf.join(" "))}
      </p>,
    );
  }

  return <div>{blocks}</div>;
}
