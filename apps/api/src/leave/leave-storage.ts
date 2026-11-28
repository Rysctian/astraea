import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { LEAVE_ATTACHMENT_EXTENSIONS, LEAVE_ATTACHMENT_MAX_BYTES } from "@starter/shared";

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export interface UploadedAttachmentInput {
  buffer: Buffer;
  filename: string;
}

export interface StoredAttachmentResult {
  relativePath: string;
  originalName: string;
}

@Injectable()
export class LeaveStorageService {
  private readonly rootDir = path.resolve(process.cwd(), "storage", "leave-attachments");

  validateAttachment(file: UploadedAttachmentInput): { ext: string; safeOriginalName: string } {
    if (file.buffer.byteLength === 0) {
      throw new BadRequestException("Uploaded attachment is empty");
    }
    if (file.buffer.byteLength > LEAVE_ATTACHMENT_MAX_BYTES) {
      throw new BadRequestException("Attachment exceeds the maximum allowed size of 5 MB");
    }

    const baseName = path.basename(file.filename || "attachment").trim() || "attachment";
    const ext = path.extname(baseName).replace(/^\./, "").toLowerCase();
    if (!(LEAVE_ATTACHMENT_EXTENSIONS as readonly string[]).includes(ext)) {
      throw new BadRequestException(
        `Unsupported attachment format ".${ext || "unknown"}". Allowed: ${LEAVE_ATTACHMENT_EXTENSIONS.join(", ")}`,
      );
    }

    return { ext, safeOriginalName: baseName.slice(0, 255) };
  }

  async storePrivateAttachment(
    employeeId: string,
    file: UploadedAttachmentInput,
  ): Promise<StoredAttachmentResult> {
    const { ext, safeOriginalName } = this.validateAttachment(file);
    const safeEmpDir = employeeId.replace(/[^A-Za-z0-9_-]/g, "_");
    const fileName = `${randomUUID()}.${ext}`;
    const relativePath = `${safeEmpDir}/${fileName}`;
    const fullPath = this.resolveSafePath(relativePath);

    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, file.buffer);

    return { relativePath, originalName: safeOriginalName };
  }

  async deletePrivateAttachment(relativePath: string): Promise<void> {
    try {
      const fullPath = this.resolveSafePath(relativePath);
      await unlink(fullPath);
    } catch {
      // Ignore already-deleted or missing file during rollback cleanup
    }
  }

  async readPrivateAttachment(relativePath: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const fullPath = this.resolveSafePath(relativePath);
    try {
      const buffer = await readFile(fullPath);
      const ext = path.extname(fullPath).replace(/^\./, "").toLowerCase();
      return {
        buffer,
        mimeType: MIME_BY_EXT[ext] ?? "application/octet-stream",
      };
    } catch {
      throw new NotFoundException("Attachment file could not be found in private storage");
    }
  }

  private resolveSafePath(relativePath: string): string {
    const resolved = path.resolve(this.rootDir, relativePath);
    if (!resolved.startsWith(this.rootDir)) {
      throw new BadRequestException("Invalid attachment storage path");
    }
    return resolved;
  }
}
