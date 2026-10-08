import { Transform } from 'class-transformer';

/**
 * Turns an untouched form field into `undefined` rather than an empty string.
 *
 * Every HTML form submits `""` for an optional input nobody filled in, and
 * `@IsOptional()` does not skip it — that decorator only passes over
 * `undefined` and `null`. So the empty string reaches the format validators
 * and a blank LinkedIn box fails with "Please enter a valid URL", which is a
 * confusing thing to say about a field the candidate was allowed to ignore.
 *
 * Eight fields on the job application had this problem at once — every
 * optional one carrying `@IsUrl`, `@IsNotEmpty`, `@Matches` or `@MinLength`.
 * Fixing it per-field would mean remembering it per-field; the next optional
 * field with a format rule would arrive broken in the same way.
 *
 * The alternative is for callers to delete empty keys before sending, which
 * is both easy to forget and wrong to require: the browser's behaviour here
 * is correct, and "" from a form means "not answered".
 *
 * Trims first, so a field containing only spaces counts as untouched too.
 * Anything with content passes through unchanged for the real validators to
 * judge — this decorator's only job is the empty case.
 */
export function ToOptionalString(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }): unknown => {
    if (typeof value !== 'string') return value;

    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  });
}
