import {
  detectFileType,
  looksLikeOoxml,
  verifySignature,
} from './file-signature.util';

const pdf = (body = 'rest of the document') =>
  Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from(body)]);

const zip = (body = '') =>
  Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(body)]);

const docx = () => zip('....[Content_Types].xml....word/document.xml');

const legacyDoc = () =>
  Buffer.concat([
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    Buffer.from('ole2 payload'),
  ]);

/** MZ header — a Windows executable. */
const exe = () =>
  Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00]), Buffer.from('MZ')]);

describe('file-signature.util', () => {
  describe('detectFileType', () => {
    it('recognises a PDF', () => {
      expect(detectFileType(pdf())).toBe('pdf');
    });

    it('recognises an OOXML container', () => {
      expect(detectFileType(docx())).toBe('docx');
    });

    it('recognises a legacy .doc', () => {
      expect(detectFileType(legacyDoc())).toBe('doc');
    });

    it('does not recognise an executable', () => {
      expect(detectFileType(exe())).toBe('unknown');
    });

    it('handles a buffer shorter than any signature', () => {
      expect(detectFileType(Buffer.from([0x25]))).toBe('unknown');
    });
  });

  describe('looksLikeOoxml', () => {
    it('is true for a real DOCX package', () => {
      expect(looksLikeOoxml(docx())).toBe(true);
    });

    it('is false for a plain zip', () => {
      expect(looksLikeOoxml(zip('just some archived bytes'))).toBe(false);
    });
  });

  describe('verifySignature', () => {
    it('accepts a PDF where PDF is allowed', () => {
      expect(verifySignature(pdf(), ['pdf'])).toEqual({
        ok: true,
        detected: 'pdf',
      });
    });

    it('rejects an executable renamed as a PDF', () => {
      const result = verifySignature(exe(), ['pdf']);
      expect(result.ok).toBe(false);
      expect(result.detected).toBe('unknown');
      expect(result.reason).toContain('do not match any accepted format');
    });

    it('rejects a DOCX where only PDF is allowed', () => {
      const result = verifySignature(docx(), ['pdf']);
      expect(result.ok).toBe(false);
      expect(result.detected).toBe('docx');
      expect(result.reason).toContain('not accepted here');
    });

    it('rejects a plain zip masquerading as a Word document', () => {
      const result = verifySignature(zip('not really a document'), ['docx']);
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('ZIP archive');
    });

    it('accepts a genuine DOCX where DOCX is allowed', () => {
      expect(verifySignature(docx(), ['pdf', 'docx']).ok).toBe(true);
    });

    it('rejects an empty file', () => {
      const result = verifySignature(Buffer.alloc(0), ['pdf']);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('File is empty');
    });
  });
});
