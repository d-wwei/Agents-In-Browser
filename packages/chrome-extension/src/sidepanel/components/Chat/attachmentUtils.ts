import type { ChatAttachment } from "@anthropic-ai/agents-in-browser-shared";
import { generateId } from "../../../shared/utils";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsText(file);
  });
}

export async function attachmentFromFile(
  file: File,
): Promise<ChatAttachment | null> {
  const mime = file.type || "application/octet-stream";
  const isImage = mime.startsWith("image/");
  const isTextLike =
    mime.startsWith("text/") ||
    /\.(txt|md|json|csv|js|ts|tsx|jsx|py|java|go|rs|html|css|xml|yaml|yml|log|sql)$/i.test(
      file.name,
    );

  if (isImage) {
    const dataUrl = await readFileAsDataUrl(file);
    return {
      id: generateId(),
      type: "image",
      content: dataUrl,
      mimeType: mime,
      preview: file.name || "image",
    };
  }

  if (isTextLike) {
    const raw = await readFileAsText(file);
    const max = 200_000;
    const text = raw.length > max ? `${raw.slice(0, max)}\n\n...[truncated]` : raw;
    return {
      id: generateId(),
      type: "text",
      content: `File: ${file.name}\n\n${text}`,
      mimeType: mime,
      preview: file.name || "text file",
    };
  }

  return {
    id: generateId(),
    type: "text",
    content: `Attached file: ${file.name}\nType: ${mime}\nSize: ${file.size} bytes`,
    mimeType: mime,
    preview: file.name || "file",
  };
}

export async function attachmentsFromFiles(
  files: FileList | File[],
): Promise<ChatAttachment[]> {
  const list = Array.from(files || []);
  const out: ChatAttachment[] = [];
  for (const file of list) {
    try {
      const attachment = await attachmentFromFile(file);
      if (attachment) out.push(attachment);
    } catch {
      // Skip unreadable files and continue.
    }
  }
  return out;
}
