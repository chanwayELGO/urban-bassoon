import { LS } from './storage';
/* ── ATTACHMENT UTILITIES ─────────────────────────────────────────────────── */

// Compress image file to base64 (max 800px, jpeg 0.78)
export const compressImage = (file) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 800;
      const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width = img.width * ratio; canvas.height = img.height * ratio;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve({ data: canvas.toDataURL("image/jpeg", 0.78), type: "image/jpeg", name: file.name });
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

// Read file as base64 (for PDFs / non-image docs)
export const readFileAsBase64 = (file) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = (ev) => resolve({ data: ev.target.result, type: file.type, name: file.name });
  reader.readAsDataURL(file);
});

export const isImage = (type) => type && type.startsWith("image/");
export const isPDF = (type) => type === "application/pdf";
export const fileExt = (name) => (name||"").split(".").pop().toUpperCase().slice(0,4);
export const fileIcon = (type) => isPDF(type) ? "📄" : isImage(type) ? "🖼️" : "📎";
export const formatBytes = (str) => { const b = Math.round(str.length * 0.75); return b > 1048576 ? `${(b/1048576).toFixed(1)} MB` : `${Math.round(b/1024)} KB`; };

// Process uploaded files → attachment objects
export const processFiles = async (fileList) => {
  const results = [];
  for (const file of Array.from(fileList)) {
    if (file.size > 10 * 1024 * 1024) continue; // skip >10MB
    const att = isImage(file.type) ? await compressImage(file) : await readFileAsBase64(file);
    results.push({ id: Date.now() + Math.random(), ...att, uploadedAt: new Date().toISOString() });
  }
  return results;
};

/* ── ATTACHMENT INLINE COMPONENT ──────────────────────────────────────────── */
// Inline attachment upload strip used inside expense rows / activity rows
