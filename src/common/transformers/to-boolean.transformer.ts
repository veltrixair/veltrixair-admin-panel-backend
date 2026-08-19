import { Transform } from 'class-transformer';

const TRUTHY = ['true', '1', 'yes', 'on'];
const FALSY = ['false', '0', 'no', 'off', ''];

/**
 * Turns a string into a boolean, correctly.
 *
 * Needed because the global ValidationPipe runs with
 * `transformOptions: { enableImplicitConversion: true }`, and class-transformer
 * implements that for booleans as `Boolean(value)`. Every non-empty string is
 * truthy, so the string `"false"` becomes `true` — and it happens *before* any
 * @Transform on the property, so a transform reading `value` sees a boolean
 * that has already lost the distinction it was meant to preserve.
 *
 * Reading `obj[key]` gets the original, untouched value instead.
 *
 * This only bites where booleans arrive as text: query strings and
 * multipart/form-data. A JSON body carries real booleans and is unaffected —
 * which is exactly why it went unnoticed until the first multipart form.
 *
 * Anything unrecognised is passed through untouched so @IsBoolean() reports it,
 * rather than being silently coerced to false.
 */
export function ToBoolean(): PropertyDecorator {
  return Transform(({ obj, key }: { obj: unknown; key: string }): unknown => {
    const raw = (obj as Record<string, unknown>)[key];

    if (typeof raw === 'boolean') return raw;
    if (typeof raw !== 'string') return raw;

    const normalised = raw.trim().toLowerCase();
    if (TRUTHY.includes(normalised)) return true;
    if (FALSY.includes(normalised)) return false;
    return raw;
  });
}
