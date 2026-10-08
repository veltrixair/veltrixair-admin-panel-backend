/**
 * One phone number from the two fields a form sends.
 *
 * The country picker used across the public sites emits its dial code as a
 * separate hidden field, shaped "+91 IN" — dial, a space, then the ISO code it
 * uses to track its own selection. Only the dial half belongs on the number;
 * "IN" is the picker talking to itself.
 *
 * Joined on the server rather than in the browser for three reasons: the
 * stored value is complete even when a caller sends only one of the two, every
 * form gets the same answer, and a number that already begins with a "+" is
 * left alone instead of quietly acquiring a second country code.
 *
 * Returns null for a blank number, so an optional phone field stores null
 * rather than an empty string or a bare dial code.
 */
export function joinPhone(
  phoneCode: string | undefined | null,
  phone: string | undefined | null,
): string | null {
  const number = phone?.trim();
  if (!number) return null;

  const dial = phoneCode?.trim().split(/\s+/)[0];
  if (!dial || number.startsWith('+')) return number;

  return `${dial} ${number}`;
}
