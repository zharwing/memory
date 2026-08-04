import { DEFAULT_MAX_DOCUMENT_CHARS } from "./internal.js";

const MIN_CHUNK_CHARS = 1200;

export interface SemanticExtractionPlanChunk {
  chunkId: string;
  index: number;
  headingPath: string[];
  location: string;
  startLine: number;
  endLine: number;
  content: string;
  originalCharCount: number;
  promptCharCount: number;
}

export function splitSemanticDocumentIntoChunks(input: string, maxChunkChars = DEFAULT_MAX_DOCUMENT_CHARS): SemanticExtractionPlanChunk[] {
  const targetMaxChars = Math.max(MIN_CHUNK_CHARS, maxChunkChars);
  const lines = input.split(/\r?\n/);
  const sections = markdownSections(lines);
  const chunks: SemanticExtractionPlanChunk[] = [];

  for (const section of sections) {
    const sectionChunks = splitSectionLines(section.lines, section.startLine, targetMaxChars);
    for (const sectionChunk of sectionChunks) {
      const content = sectionChunk.lines.join("\n").trim();
      if (!content) continue;
      chunks.push({
        chunkId: `chunk-${String(chunks.length + 1).padStart(4, "0")}`,
        index: chunks.length,
        headingPath: section.headingPath,
        location: chunkLocation(section.headingPath, sectionChunk.startLine, sectionChunk.endLine),
        startLine: sectionChunk.startLine,
        endLine: sectionChunk.endLine,
        content,
        originalCharCount: content.length,
        promptCharCount: content.length
      });
    }
  }

  if (chunks.length > 0) return chunks;
  return [
    {
      chunkId: "chunk-0001",
      index: 0,
      headingPath: [],
      location: "lines 1-1",
      startLine: 1,
      endLine: 1,
      content: "",
      originalCharCount: 0,
      promptCharCount: 0
    }
  ];
}

function markdownSections(lines: string[]): Array<{ headingPath: string[]; startLine: number; lines: string[] }> {
  const sections: Array<{ headingPath: string[]; startLine: number; lines: string[] }> = [];
  const headingPath: string[] = [];
  let current: { headingPath: string[]; startLine: number; lines: string[] } = {
    headingPath: [],
    startLine: 1,
    lines: []
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading && current.lines.some((candidate) => candidate.trim())) {
      sections.push(current);
      const level = heading[1].length;
      headingPath.splice(level - 1);
      headingPath[level - 1] = heading[2].trim();
      current = {
        headingPath: headingPath.filter(Boolean),
        startLine: lineNumber,
        lines: [line]
      };
      return;
    }

    if (heading) {
      const level = heading[1].length;
      headingPath.splice(level - 1);
      headingPath[level - 1] = heading[2].trim();
      current.headingPath = headingPath.filter(Boolean);
    }
    current.lines.push(line);
  });

  if (current.lines.some((line) => line.trim())) sections.push(current);
  return sections;
}

function splitSectionLines(
  lines: string[],
  baseStartLine: number,
  maxChunkChars: number
): Array<{ startLine: number; endLine: number; lines: string[] }> {
  const chunks: Array<{ startLine: number; endLine: number; lines: string[] }> = [];
  let currentLines: string[] = [];
  let currentStartLine = baseStartLine;
  let currentCharCount = 0;

  lines.forEach((line, index) => {
    const lineNumber = baseStartLine + index;
    const nextLineLength = line.length + 1;
    if (currentLines.length > 0 && currentCharCount + nextLineLength > maxChunkChars) {
      chunks.push({
        startLine: currentStartLine,
        endLine: lineNumber - 1,
        lines: currentLines
      });
      currentLines = [];
      currentCharCount = 0;
      currentStartLine = lineNumber;
    }

    if (line.length > maxChunkChars) {
      if (currentLines.length > 0) {
        chunks.push({
          startLine: currentStartLine,
          endLine: lineNumber - 1,
          lines: currentLines
        });
        currentLines = [];
        currentCharCount = 0;
      }
      for (let offset = 0; offset < line.length; offset += maxChunkChars) {
        chunks.push({
          startLine: lineNumber,
          endLine: lineNumber,
          lines: [line.slice(offset, offset + maxChunkChars)]
        });
      }
      currentStartLine = lineNumber + 1;
      return;
    }

    if (currentLines.length === 0) currentStartLine = lineNumber;
    currentLines.push(line);
    currentCharCount += nextLineLength;
  });

  if (currentLines.length > 0) {
    chunks.push({
      startLine: currentStartLine,
      endLine: currentStartLine + currentLines.length - 1,
      lines: currentLines
    });
  }
  return chunks;
}

function chunkLocation(headingPath: string[], startLine: number, endLine: number): string {
  const heading = headingPath.length ? `${headingPath.join(" > ")}; ` : "";
  return `${heading}lines ${startLine}-${endLine}`;
}
