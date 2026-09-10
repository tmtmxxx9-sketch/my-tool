export type TextAnnotation = {
  description?: string | null;
  boundingPoly?: {
    vertices?: Array<{ x?: number | null; y?: number | null }> | null;
  } | null;
};

function toIsoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseExpiryDate(fullText: string): string | null {
  const patterns: Array<{
    regex: RegExp;
    parse: (match: RegExpMatchArray) => string | null;
  }> = [
    {
      regex: /(\d{4})年(\d{1,2})月(\d{1,2})日/,
      parse: (match) =>
        toIsoDate(Number(match[1]), Number(match[2]), Number(match[3])),
    },
    {
      regex: /(\d{4})\.(\d{1,2})\.(\d{1,2})/,
      parse: (match) =>
        toIsoDate(Number(match[1]), Number(match[2]), Number(match[3])),
    },
    {
      regex: /(\d{4})\/(\d{1,2})\/(\d{1,2})/,
      parse: (match) =>
        toIsoDate(Number(match[1]), Number(match[2]), Number(match[3])),
    },
    {
      regex: /(\d{2})\.(\d{2})\.(\d{2})/,
      parse: (match) =>
        toIsoDate(2000 + Number(match[1]), Number(match[2]), Number(match[3])),
    },
  ];

  for (const pattern of patterns) {
    const match = fullText.match(pattern.regex);
    if (match) {
      const isoDate = pattern.parse(match);
      if (isoDate) {
        return isoDate;
      }
    }
  }

  return null;
}

function pickFromFullText(fullText: string): string | null {
  const line = fullText
    .split("\n")
    .map((value) => value.trim())
    .find((value) => value.length >= 2);

  return line ?? null;
}

export function parseProductName(
  annotations: TextAnnotation[],
  fullText: string,
): string | null {
  if (annotations.length <= 1) {
    return pickFromFullText(fullText);
  }

  type LineGroup = {
    minY: number;
    texts: Array<{ text: string; minX: number; area: number }>;
  };

  const lines: LineGroup[] = [];
  const lineThreshold = 12;

  for (let index = 1; index < annotations.length; index += 1) {
    const annotation = annotations[index];
    const text = annotation.description?.trim();
    if (!text) {
      continue;
    }

    const vertices = annotation.boundingPoly?.vertices ?? [];
    if (vertices.length === 0) {
      continue;
    }

    const xs = vertices.map((vertex) => vertex.x ?? 0);
    const ys = vertices.map((vertex) => vertex.y ?? 0);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const width = Math.max(...xs) - minX;
    const height = Math.max(...ys) - minY;
    const area = width * height;

    const existingLine = lines.find(
      (line) => Math.abs(line.minY - minY) <= lineThreshold,
    );

    if (existingLine) {
      existingLine.texts.push({ text, minX, area });
    } else {
      lines.push({ minY, texts: [{ text, minX, area }] });
    }
  }

  if (lines.length === 0) {
    return pickFromFullText(fullText);
  }

  let bestLine = "";
  let bestScore = 0;

  for (const line of lines) {
    const sortedTexts = [...line.texts].sort((a, b) => a.minX - b.minX);
    const lineText = sortedTexts.map((entry) => entry.text).join(" ");
    const areaScore = sortedTexts.reduce((sum, entry) => sum + entry.area, 0);
    const topBonus = Math.max(0, 3000 - line.minY);
    const score = areaScore + topBonus;

    if (score > bestScore) {
      bestScore = score;
      bestLine = lineText;
    }
  }

  return bestLine.trim() || pickFromFullText(fullText);
}
