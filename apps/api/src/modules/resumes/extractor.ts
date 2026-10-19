import path from "node:path";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import {
  ALLOWED_RESUME_EXTENSIONS,
  ALLOWED_RESUME_MIME_TYPES,
  MAX_RESUME_FILE_BYTES,
  MAX_RESUME_TEXT_CHARS,
  type AllowedResumeMimeType,
} from "@codementor/shared";
import { AppError } from "../../lib/errors.js";

export interface ExtractedResume {
  fileName: string;
  fileSize: number;
  mimeType: AllowedResumeMimeType;
  extractedText: string;
}

/** Check file magic numbers for PDF and DOCX */
export function detectMagicMimeType(buffer: Buffer): AllowedResumeMimeType | null {
  if (buffer.length < 4) return null;

  // PDF magic number: %PDF (0x25 0x50 0x44 0x46)
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return "application/pdf";
  }

  // DOCX is a zip archive: PK\x03\x04 (0x50 0x4B 0x03 0x04)
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  return null;
}

/**
 * Validates the uploaded file buffer, size, extension, and magic header,
 * then extracts clean textual content.
 */
export async function extractResumeText(
  buffer: Buffer,
  originalFileName: string,
  declaredMimeType?: string,
): Promise<ExtractedResume> {
  if (!buffer || buffer.length === 0) {
    throw AppError.badRequest("Uploaded file is empty", "EMPTY_FILE");
  }

  if (buffer.length > MAX_RESUME_FILE_BYTES) {
    throw AppError.badRequest(
      `File size exceeds maximum allowed limit of ${MAX_RESUME_FILE_BYTES / (1024 * 1024)}MB`,
      "FILE_TOO_LARGE",
    );
  }

  const ext = path.extname(originalFileName).toLowerCase();
  if (!ALLOWED_RESUME_EXTENSIONS.includes(ext as (typeof ALLOWED_RESUME_EXTENSIONS)[number])) {
    throw AppError.badRequest(
      "Only PDF (.pdf) and Microsoft Word (.docx) documents are supported",
      "INVALID_FILE_TYPE",
    );
  }

  if (
    declaredMimeType &&
    !ALLOWED_RESUME_MIME_TYPES.includes(declaredMimeType as AllowedResumeMimeType)
  ) {
    throw AppError.badRequest("Unsupported MIME type", "INVALID_FILE_TYPE");
  }

  const detectedMime = detectMagicMimeType(buffer);
  if (!detectedMime) {
    throw AppError.badRequest(
      "The file contents do not match a valid PDF or DOCX format",
      "INVALID_FILE_SIGNATURE",
    );
  }

  // Cross check declared extension with magic bytes
  if (ext === ".pdf" && detectedMime !== "application/pdf") {
    throw AppError.badRequest("The file extension does not match its contents", "MIME_MISMATCH");
  }
  if (
    ext === ".docx" &&
    detectedMime !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    throw AppError.badRequest("The file extension does not match its contents", "MIME_MISMATCH");
  }

  let text = "";
  try {
    if (detectedMime === "application/pdf") {
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        text = result.text || "";
      } finally {
        await parser.destroy();
      }
    } else {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value || "";
    }
  } catch (err) {
    const msg = (err as Error)?.message || "";
    if (/password/i.test(msg) || /encrypted/i.test(msg)) {
      throw AppError.badRequest(
        "Password-protected files cannot be read. Please upload an unprotected copy.",
        "ENCRYPTED_FILE",
      );
    }
    throw AppError.badRequest(
      "Could not read document contents. The file may be corrupt or invalid.",
      "PARSING_FAILED",
    );
  }

  // Normalize whitespace
  const cleanedText = text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();

  if (cleanedText.length < 20) {
    throw AppError.badRequest(
      "No readable text found in document. Please ensure the document is not an empty or scanned image file.",
      "NO_TEXT_FOUND",
    );
  }

  // Limit length to avoid blowing prompts
  const extractedText =
    cleanedText.length > MAX_RESUME_TEXT_CHARS
      ? cleanedText.slice(0, MAX_RESUME_TEXT_CHARS)
      : cleanedText;

  // Sanitize filename to avoid directory traversal or strange characters
  const safeName = path.basename(originalFileName).slice(0, 150);

  return {
    fileName: safeName,
    fileSize: buffer.length,
    mimeType: detectedMime,
    extractedText,
  };
}
