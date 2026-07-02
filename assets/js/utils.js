export function formatTime(seconds) {
      if (!Number.isFinite(seconds)) {
        return "0:00";
      }

      const minutes = Math.floor(seconds / 60);
      const remaining = Math.floor(seconds % 60)
        .toString()
        .padStart(2, "0");

      return `${minutes}:${remaining}`;
    }

export function clamp(value, minimum, maximum) {
      return Math.max(minimum, Math.min(maximum, value));
    }

export function sanitizeFileName(value) {
      return String(value || "")
        .replace(/\.[^.]+$/, "")
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^[-_]+|[-_]+$/g, "")
        .slice(0, 96);
    }
