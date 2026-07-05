import type { ReactNode } from "react";
import { isLikelyMermaidSource, MermaidDiagramPreview } from "./MermaidDiagramPreview.js";

export function MarkdownPreview({ body }: { body: string }) {
  if (!body.trim()) {
    return <div className="rendered-markdown empty-preview">No document body recorded.</div>;
  }
  if (isLikelyMermaidSource(body.trim())) {
    return (
      <div className="rendered-markdown">
        <MermaidDiagramPreview source={body.trim()} />
      </div>
    );
  }
  return <div className="rendered-markdown">{renderMarkdownBlocks(body)}</div>;
}

function renderMarkdownBlocks(markdown: string): ReactNode[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  let blockIndex = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    const key = `md-${blockIndex++}`;

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      if (language.toLowerCase() === "mermaid") {
        blocks.push(<MermaidDiagramPreview key={key} source={codeLines.join("\n")} />);
        continue;
      }
      blocks.push(
        <pre key={key}>
          <code>{language ? `${language}\n${codeLines.join("\n")}` : codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (heading) {
      const content = renderInlineMarkdown(heading[2], key);
      if (heading[1].length === 1) blocks.push(<h1 key={key}>{content}</h1>);
      else if (heading[1].length === 2) blocks.push(<h2 key={key}>{content}</h2>);
      else if (heading[1].length === 3) blocks.push(<h3 key={key}>{content}</h3>);
      else if (heading[1].length === 4) blocks.push(<h4 key={key}>{content}</h4>);
      else if (heading[1].length === 5) blocks.push(<h5 key={key}>{content}</h5>);
      else blocks.push(<h6 key={key}>{content}</h6>);
      index += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      blocks.push(<hr key={key} />);
      index += 1;
      continue;
    }

    if (isMarkdownTableStart(lines, index)) {
      const header = parseMarkdownTableRow(lines[index]);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(parseMarkdownTableRow(lines[index]));
        index += 1;
      }
      blocks.push(
        <div className="markdown-table-wrap" key={key}>
          <table className="markdown-table">
            <thead>
              <tr>{header.map((cell, cellIndex) => <th key={`${key}-h-${cellIndex}`}>{renderInlineMarkdown(cell, `${key}-h-${cellIndex}`)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`${key}-r-${rowIndex}`}>
                  {row.map((cell, cellIndex) => <td key={`${key}-r-${rowIndex}-${cellIndex}`}>{renderInlineMarkdown(cell, `${key}-r-${rowIndex}-${cellIndex}`)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quotes: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quotes.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(<blockquote key={key}>{renderInlineMarkdown(quotes.join(" "), key)}</blockquote>);
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ""));
        index += 1;
      }
      blocks.push(<ul key={key}>{items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{renderInlineMarkdown(item, `${key}-${itemIndex}`)}</li>)}</ul>);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      blocks.push(<ol key={key}>{items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{renderInlineMarkdown(item, `${key}-${itemIndex}`)}</li>)}</ol>);
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !isMarkdownBlockStart(lines, index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(<p key={key}>{renderInlineMarkdown(paragraph.join(" "), key)}</p>);
  }

  return blocks;
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+?\*\*|\*[^*\n]+?\*|\[[^\]]+?\]\([^)]+?\))/g;
  let lastIndex = 0;
  let matchIndex = 0;

  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));

    const token = match[0];
    const key = `${keyPrefix}-inline-${matchIndex++}`;
    if (token.startsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*")) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      const link = /^\[([^\]]+?)\]\(([^)]+?)\)$/.exec(token);
      const href = link?.[2] || "";
      const safeHref = /^(https?:|mailto:)/.test(href) ? href : "";
      nodes.push(safeHref ? (
        <a href={safeHref} key={key} rel="noreferrer" target="_blank">{link?.[1]}</a>
      ) : (
        <span key={key}>{link?.[1] || token}</span>
      ));
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function isMarkdownBlockStart(lines: string[], index: number): boolean {
  const trimmed = lines[index]?.trim() || "";
  return trimmed.startsWith("```") ||
    /^#{1,6}\s+/.test(trimmed) ||
    /^(-{3,}|\*{3,})$/.test(trimmed) ||
    /^>\s?/.test(trimmed) ||
    /^[-*]\s+/.test(trimmed) ||
    /^\d+\.\s+/.test(trimmed) ||
    isMarkdownTableStart(lines, index);
}

function isMarkdownTableStart(lines: string[], index: number): boolean {
  const line = lines[index]?.trim() || "";
  const next = lines[index + 1]?.trim() || "";
  return line.includes("|") && /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(next);
}

function parseMarkdownTableRow(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}
