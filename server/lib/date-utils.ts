const ISO_DATE_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const WEEKDAY_ALIASES: Array<{ index: number; regex: RegExp }> = [
  { index: 0, regex: /\b(sunday|sun)\b/i },
  { index: 1, regex: /\b(monday|mon)\b/i },
  { index: 2, regex: /\b(tuesday|tue)\b/i },
  { index: 3, regex: /\b(wednesday|wed)\b/i },
  { index: 4, regex: /\b(thursday|thu|thur)\b/i },
  { index: 5, regex: /\b(friday|fri)\b/i },
  { index: 6, regex: /\b(saturday|sat)\b/i },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface DateConversionOptions {
  referenceDate?: Date;
  alignWith?: Date;
}

/**
 * Converts a human-friendly date string into an ISO-8601 timestamp
 * that is guaranteed to be at or after the provided reference date.
 */
export function convertToFutureIsoDate(
  value: string,
  options: DateConversionOptions = {}
): string {
  const parsed = parseToFutureDate(value, options);
  return parsed.toISOString();
}

function parseToFutureDate(
  value: string,
  options: DateConversionOptions = {}
): Date {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error('Empty date value received from Gemini');
  }

  const reference = options.referenceDate
    ? new Date(options.referenceDate)
    : new Date();
  const alignWith = options.alignWith ? new Date(options.alignWith) : undefined;
  const containsYear = /\b\d{4}\b/.test(trimmed);
  const forceNextWeek = /\bnext\b/i.test(trimmed);

  let candidate: Date | null = null;
  let kind: 'iso' | 'monthDay' | 'weekday' | 'general' = 'general';

  if (ISO_DATE_REGEX.test(trimmed)) {
    candidate = new Date(trimmed);
    kind = 'iso';
  } else {
    const parsed = tryParseNativeFormat(trimmed);
    if (parsed) {
      candidate = parsed;
      kind = containsYear ? 'general' : 'monthDay';
    }
  }

  if (!candidate || Number.isNaN(candidate.getTime())) {
    const weekdayIndex = findWeekdayIndex(trimmed);
    if (weekdayIndex !== null) {
      candidate = buildWeekdayDate(weekdayIndex, reference);
      kind = 'weekday';

      if (forceNextWeek) {
        candidate.setUTCDate(candidate.getUTCDate() + 7);
      }
    }
  }

  if (!candidate || Number.isNaN(candidate.getTime())) {
    throw new Error(`Cannot parse date string from Gemini: "${value}"`);
  }

  if (kind === 'weekday' && alignWith) {
    applyTimeOfDay(candidate, alignWith);
  }

  if (kind === 'monthDay' && !containsYear) {
    while (candidate.getTime() < reference.getTime()) {
      candidate.setUTCFullYear(candidate.getUTCFullYear() + 1);
    }
  }

  ensureIsFuture(candidate, reference, kind);
  return candidate;
}

function tryParseNativeFormat(text: string): Date | null {
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function findWeekdayIndex(text: string): number | null {
  for (const { index, regex } of WEEKDAY_ALIASES) {
    if (regex.test(text)) {
      return index;
    }
  }
  return null;
}

function buildWeekdayDate(dayIndex: number, reference: Date): Date {
  const base = new Date(
    Date.UTC(
      reference.getUTCFullYear(),
      reference.getUTCMonth(),
      reference.getUTCDate()
    )
  );
  const offset = (dayIndex - base.getUTCDay() + 7) % 7;
  base.setUTCDate(base.getUTCDate() + offset);
  return base;
}

function applyTimeOfDay(target: Date, source: Date) {
  target.setUTCHours(
    source.getUTCHours(),
    source.getUTCMinutes(),
    source.getUTCSeconds(),
    source.getUTCMilliseconds()
  );
}

function ensureIsFuture(
  candidate: Date,
  reference: Date,
  kind: 'iso' | 'monthDay' | 'weekday' | 'general'
) {
  if (candidate.getTime() >= reference.getTime()) {
    return;
  }

  if (kind === 'weekday') {
    while (candidate.getTime() < reference.getTime()) {
      candidate.setUTCDate(candidate.getUTCDate() + 7);
    }
    return;
  }

  if (kind === 'monthDay') {
    while (candidate.getTime() < reference.getTime()) {
      candidate.setUTCFullYear(candidate.getUTCFullYear() + 1);
    }
    return;
  }

  const diffMs = reference.getTime() - candidate.getTime();
  const diffDays = Math.ceil(diffMs / MS_PER_DAY);
  candidate.setUTCDate(candidate.getUTCDate() + diffDays);
}
