export type CopyShareResult = "shared" | "copied" | "cancelled" | "failed";

function copyWithExecCommand(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  return copied;
}

export async function copyOrShareText(
  text: string,
  title = "買い物リスト",
): Promise<CopyShareResult> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text });
      return "shared";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return "cancelled";
      }
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return "copied";
    } catch {
      // fall through to execCommand
    }
  }

  try {
    return copyWithExecCommand(text) ? "copied" : "failed";
  } catch {
    return "failed";
  }
}
