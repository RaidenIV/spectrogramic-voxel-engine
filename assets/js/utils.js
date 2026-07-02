// utils.js — generated module split of the Spectrogramic Voxel Engine (behavior unchanged)
// Pure helpers (formatting, math, files, blobs).
import { renderer } from "./core.js";

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

export function hexToHudRgba(hex, alpha = 1) {
  const value = String(hex || "#ffffff").replace("#", "");
  const normalized = value.length === 3
    ? value.split("").map((character) => character + character).join("")
    : value.padEnd(6, "f").slice(0, 6);
  const number = Number.parseInt(normalized, 16);
  const red = (number >> 16) & 255;
  const green = (number >> 8) & 255;
  const blue = number & 255;
  return `rgba(${red}, ${green}, ${blue}, ${clamp(alpha, 0, 1)})`;
}

export const isFirefoxBrowser = /Firefox\//i.test(navigator.userAgent);

export function sanitizeFileName(value) {
  return String(value || "")
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 96);
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function canvasToBlob(type = "image/png") {
  return new Promise((resolve, reject) => {
    renderer.domElement.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("The browser could not create the export blob."));
      }
    }, type);
  });
}

export function nextEventLoopTurn() {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}
