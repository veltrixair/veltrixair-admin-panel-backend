import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { APPLICATION_FIELD_KEYS } from '../application-fields.constants';

/**
 * Checks a posting's `applicationFields` against the catalogue.
 *
 * The column is jsonb, so the database will accept any shape at all. Rejecting
 * an unknown key matters more than it looks: a misspelt one would be stored
 * happily and simply never take effect, which is the kind of bug nobody finds
 * until a candidate says a field they were promised was missing from the form.
 */
@ValidatorConstraint({ name: 'applicationFieldConfig', async: false })
export class IsApplicationFieldConfig implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false;
    }

    return Object.entries(value as Record<string, unknown>).every(
      ([key, setting]) => {
        if (!(APPLICATION_FIELD_KEYS as string[]).includes(key)) return false;
        if (typeof setting !== 'object' || setting === null) return false;

        const { on, required } = setting as {
          on?: unknown;
          required?: unknown;
        };
        return (
          typeof on === 'boolean' &&
          (required === undefined || typeof required === 'boolean')
        );
      },
    );
  }

  defaultMessage(): string {
    return (
      'applicationFields must map known questions to { on, required }. ' +
      `Known questions: ${APPLICATION_FIELD_KEYS.join(', ')}`
    );
  }
}
