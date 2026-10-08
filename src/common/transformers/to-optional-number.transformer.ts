import { Transform } from 'class-transformer';

/**
 * Turns an empty form field into `undefined` instead of `0`.
 *
 * A `<select>` with nothing chosen, or a cleared number input, submits an empty
 * string. The global ValidationPipe runs with `enableImplicitConversion: true`,
 * and class-transformer implements that for numbers as `Number(value)` —
 * `Number('')` is `0`. So "the candidate did not answer" arrives as a real,
 * valid-looking zero.
 *
 * Three things then go wrong quietly, in order:
 *
 *   - `@IsOptional()` does not fire, because it only skips `undefined` and
 *     `null`. `0` is neither.
 *   - the posting's required-field check counts the answer as given, so a
 *     genuinely blank mandatory question passes.
 *   - `value ?? null` keeps the `0`, because `??` only catches null and
 *     undefined — and `0` is not a code any master table holds, so the insert
 *     dies on a foreign key hundreds of lines from the cause.
 *
 * Reading `obj[key]` gets the raw string before implicit conversion has had it,
 * which is the only place the distinction still exists. Anything that is not
 * blank is passed through untouched so `@IsInt` / `@IsNumber` still judge it —
 * this decorator's whole job is the empty case.
 *
 * Only bites where numbers arrive as text: multipart bodies and query strings.
 * A JSON body carries real numbers and a real `null`.
 */
export function ToOptionalNumber(): PropertyDecorator {
  return Transform(({ obj, key }: { obj: unknown; key: string }): unknown => {
    const raw = (obj as Record<string, unknown>)[key];

    if (raw === undefined || raw === null) return undefined;
    if (typeof raw === 'number') return raw;
    if (typeof raw !== 'string') return raw;

    const trimmed = raw.trim();
    if (trimmed === '') return undefined;

    // Does the conversion itself rather than leaving it to `@Type`: a
    // @Transform on a property replaces @Type entirely, so returning the string
    // here would hand @IsInt a string and fail every populated field.
    // A non-numeric string becomes NaN, which @IsInt / @IsNumber then reject
    // with their own message — exactly what should happen.
    return Number(trimmed);
  });
}
