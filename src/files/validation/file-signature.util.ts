/**
 * Magic-byte detection.
 *
 * The declared MIME type and the filename extension both come from the client,
 * so neither is evidence of anything — renaming `payload.exe` to `cv.pdf` sets
 * both to whatever the uploader wants. The only trustworthy signal is what the
 * first bytes of the file actually are.
 *
 * Deliberately hand-rolled rather than pulling a dependency: three formats is
 * about twenty lines, and the check is security-relevant enough to be worth
 * reading in full.
 */

export type DetectedType = 'pdf' | 'docx' | 'doc' | 'unknown';

interface Signature {
  type: Exclude<DetectedType, 'unknown'>;
  /** Byte sequence expected at `offset`. */
  bytes: number[];
  offset: number;
}

const SIGNATURES: Signature[] = [
  // "%PDF-"
  { type: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d], offset: 0 },
  // ZIP local file header — DOCX and every other OOXML container.
  { type: 'docx', bytes: [0x50, 0x4b, 0x03, 0x04], offset: 0 },
  // OLE2 compound document — legacy .doc.
  {
    type: 'doc',
    bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
    offset: 0,
  },
];

export function detectFileType(buffer: Buffer): DetectedType {
  for (const sig of SIGNATURES) {
    if (buffer.length < sig.offset + sig.bytes.length) continue;
    const matches = sig.bytes.every(
      (byte, i) => buffer[sig.offset + i] === byte,
    );
    if (matches) return sig.type;
  }
  return 'unknown';
}

/**
 * A ZIP header alone does not prove DOCX — every OOXML file and every plain
 * zip share it. Checking for the OOXML marker inside costs one scan and stops
 * a renamed archive being accepted as a document.
 */
export function looksLikeOoxml(buffer: Buffer): boolean {
  // "[Content_Types].xml" appears near the start of every OOXML package.
  return buffer
    .subarray(0, Math.min(buffer.length, 4096))
    .includes(Buffer.from('[Content_Types].xml'));
}

export interface SignatureCheck {
  ok: boolean;
  detected: DetectedType;
  reason?: string;
}

/**
 * Verifies the bytes against the types a purpose permits.
 *
 * `allowed` uses the same short names as `DetectedType` so callers never have
 * to reason about MIME strings, which are equally client-supplied.
 */
export function verifySignature(
  buffer: Buffer,
  allowed: readonly DetectedType[],
): SignatureCheck {
  if (buffer.length === 0) {
    return { ok: false, detected: 'unknown', reason: 'File is empty' };
  }

  const detected = detectFileType(buffer);

  if (detected === 'unknown') {
    return {
      ok: false,
      detected,
      reason:
        'File contents do not match any accepted format. Only PDF and Word documents are allowed.',
    };
  }

  if (detected === 'docx' && !looksLikeOoxml(buffer)) {
    return {
      ok: false,
      detected,
      reason: 'File is a ZIP archive rather than a Word document',
    };
  }

  if (!allowed.includes(detected)) {
    return {
      ok: false,
      detected,
      reason: `${detected.toUpperCase()} files are not accepted here. Allowed: ${allowed
        .map((a) => a.toUpperCase())
        .join(', ')}.`,
    };
  }

  return { ok: true, detected };
}
