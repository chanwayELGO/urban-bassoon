#!/usr/bin/env node
/**
 * Splits src/legacy/app-body.jsx into Vite modules.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const body = fs.readFileSync(path.join(root, 'src/legacy/app-body.jsx'), 'utf8');
const lines = body.split('\n');

const markers = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (/^function \w+/.test(line)) markers.push({ name: line.match(/^function (\w+)/)[1], start: i, type: 'function' });
  else if (/^const (\w+) = (\(|async)/.test(line) && !line.includes('=> c===')) {
    const m = line.match(/^const (\w+) =/);
    if (m && !['processFiles'].includes(m[1]) || m[1] === 'processFiles')
      markers.push({ name: m[1], start: i, type: 'const' });
  }
}

// Dedupe and sort
const seen = new Set();
const ordered = markers.filter(m => {
  if (seen.has(m.name)) return false;
  seen.add(m.name);
  return true;
}).sort((a, b) => a.start - b.start);

for (let i = 0; i < ordered.length; i++) {
  ordered[i].end = i + 1 < ordered.length ? ordered[i + 1].start - 1 : lines.length - 1;
}

const constantsEnd = ordered.find(m => m.name === 'LS')?.start ?? 49;
const constantsBlock = lines.slice(2, constantsEnd).join('\n');

// --- lib/constants.ts ---
const constantsTs = constantsBlock
  .replace(/^const /gm, 'export const ')
  .replace(/^\/\//gm, '//');
fs.mkdirSync(path.join(root, 'src/lib'), { recursive: true });
fs.writeFileSync(path.join(root, 'src/lib/constants.ts'), constantsTs + '\n');

// --- lib/storage.ts ---
fs.writeFileSync(path.join(root, 'src/lib/storage.ts'), `export const LS = {
  get: <T>(k: string, def: T): T => {
    try {
      const v = localStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : def;
    } catch {
      return def;
    }
  },
  set: (k: string, v: unknown) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* quota */
    }
  },
};
`);

// --- lib/ai.ts ---
fs.writeFileSync(path.join(root, 'src/lib/ai.ts'), `export type AiTask =
  | 'brief'
  | 'pack'
  | 'recheck'
  | 'smartpack'
  | 'ocr'
  | 'tip'
  | 'visa'
  | 'discovery'
  | 'caption'
  | 'enhance'
  | 'story';

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }>;
}

export interface AiRequest {
  task: AiTask;
  system?: string;
  messages: AiMessage[];
  maxTokens?: number;
}

export async function callAi(req: AiRequest): Promise<string> {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || \`AI request failed (\${res.status})\`);
  }
  const data = (await res.json()) as { text?: string };
  return data.text ?? '';
}
`);

// Component file mapping
const componentMap = {
  AttachStrip: 'components/shared/AttachStrip.tsx',
  ViewerModal: 'components/shared/ViewerModal.tsx',
  DocsTab: 'components/tabs/DocsTab.tsx',
  SwipeableActivity: 'components/shared/SwipeableActivity.tsx',
  Dashboard: 'components/tabs/Dashboard.tsx',
  PlanTab: 'components/tabs/PlanTab.tsx',
  PackTab: 'components/tabs/PackTab.tsx',
  ShareModal: 'components/shared/ShareModal.tsx',
  BudgetTab: 'components/tabs/BudgetTab.tsx',
  ExploreTab: 'components/tabs/ExploreTab.tsx',
  MemoriesTab: 'components/tabs/MemoriesTab.tsx',
  TripDrawer: 'components/shared/TripDrawer.tsx',
  App: 'App.tsx',
};

const utilityNames = new Set([
  'countryFlag', 'compressImage', 'readFileAsBase64', 'isImage', 'isPDF', 'fileExt',
  'fileIcon', 'formatBytes', 'processFiles', 'generateExportHTML', 'addDays',
  'generateICS', 'downloadICS', 'gcalDayUrl', 'outlookDayUrl', 'detectPlatform',
  'platformLinks', 'buildDefaultPacking', 'snapshotTrip', 'restoreTrip',
  'mergeById', 'mergePeople', 'mergeItinerary', 'mergePacking', 'JSONBLOB',
]);

const header = `import React, { useState, useEffect, useRef, Fragment } from 'react';
import L from 'leaflet';
import { LS } from '../lib/storage';
import { callAi } from '../lib/ai';
import {
  DEFAULT_PACKING, EXPENSE_CATS, CURRENCIES, COUNTRY_CURRENCY,
  countryFlag, WC_ICON, WC_DESC,
} from '../lib/constants';
`;

const appHeader = `import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { LS } from './lib/storage';
import { callAi } from './lib/ai';
import {
  DEFAULT_PACKING, EXPENSE_CATS, CURRENCIES, COUNTRY_CURRENCY,
  countryFlag, WC_ICON, WC_DESC,
} from './lib/constants';
import { Dashboard } from './components/tabs/Dashboard';
import { PlanTab } from './components/tabs/PlanTab';
import { PackTab } from './components/tabs/PackTab';
import { BudgetTab } from './components/tabs/BudgetTab';
import { ExploreTab } from './components/tabs/ExploreTab';
import { MemoriesTab } from './components/tabs/MemoriesTab';
import { DocsTab } from './components/tabs/DocsTab';
import { ShareModal } from './components/shared/ShareModal';
import { TripDrawer } from './components/shared/TripDrawer';
import { buildDefaultPacking, snapshotTrip, restoreTrip, mergeById, mergePeople, mergeItinerary, mergePacking } from './lib/trip';
`;

function transformCode(code, isApp = false) {
  let c = code;
  c = c.replace(/const \{ useState, useEffect, useRef \} = React;\n\n/, '');
  c = c.replace(/React\.Fragment/g, 'Fragment');
  c = c.replace(/const L = window\.L;/g, '// L imported from leaflet');
  c = c.replace(
    /await fetch\("https:\/\/api\.anthropic\.com\/v1\/messages",\s*\{[^}]*method:\s*"POST"[^}]*headers:\s*\{[^}]*\}[^}]*body:\s*JSON\.stringify\(\{([^}]+(?:\{[^}]*\}[^}]*)*)\}\)\s*\}\)/gs,
    (match, inner) => {
      const taskMatch = match.includes('receipt') || match.includes('image/jpeg') ? 'ocr'
        : match.includes('travel photo') || match.includes('caption JSON') ? 'caption'
          : match.includes('packing') || match.includes('Smart Pack') ? 'smartpack'
            : match.includes('departure day brief') ? 'brief'
              : match.includes('visa') ? 'visa'
                : match.includes('discovery') ? 'discovery'
                  : match.includes('travel expert') ? 'tip'
                    : match.includes('memory writer') || match.includes('journal') ? 'enhance'
                      : match.includes('story') ? 'story'
                        : 'tip';
      return `await callAi({ task: '${taskMatch}', messages: [], maxTokens: 1000 }) /* TODO: migrated stub */`;
    }
  );
  // Simpler anthropic replacements - replace fetch pattern with callAi wrapper
  c = c.replace(
    /const res\s*=\s*await fetch\("https:\/\/api\.anthropic\.com\/v1\/messages",\s*\{[\s\S]*?\}\);/g,
    (block) => {
      if (block.includes('receipt') || block.includes('Extract all receipt')) {
        return `const aiText = await callAi({ task: 'ocr', system: block.includes('system:') ? '' : undefined, messages: [], maxTokens: 600 });
      const res = { ok: true, json: async () => ({ content: [{ text: aiText }] }) };`;
      }
      return `const aiText = await callAi({ task: 'tip', messages: [{ role: 'user', content: '' }], maxTokens: 1000 });
      const res = { ok: true, json: async () => ({ content: [{ text: aiText }] }) };`;
    }
  );
  c = c.replace(
    /const res=await fetch\("https:\/\/api\.anthropic\.com\/v1\/messages",\{[\s\S]*?\}\);/g,
    `const aiText = await callAi({ task: 'tip', messages: [{ role: 'user', content: aiQuery }], maxTokens: 1000 });
      const res = { ok: true, json: async () => ({ content: [{ text: aiText }] }) };`
  );
  if (!isApp) {
    c = c.replace(/^function (\w+)/, 'export function $1');
    c = c.replace(/^const (\w+) = /, 'export const $1 = ');
  } else {
    c = c.replace(/^function App/, 'export default function App');
    c = c.replace(/ReactDOM\.createRoot\(document\.getElementById\("root"\)\)\.render\(<App \/>\);\s*$/, '');
  }
  return c;
}

// Write utility lib
const utilStart = ordered.find(m => m.name === 'compressImage')?.start ?? 57;
const utilEnd = ordered.find(m => m.name === 'AttachStrip')?.start ?? 100;
let utilBlock = lines.slice(utilStart, utilEnd).join('\n');
utilBlock = transformCode(utilBlock);
utilBlock += '\n\nexport const JSONBLOB = "https://jsonblob.com/api/jsonBlob";\n';

// Add generateExportHTML and calendar helpers
const exportMarker = ordered.find(m => m.name === 'generateExportHTML');
const docsMarker = ordered.find(m => m.name === 'DocsTab');
if (exportMarker && docsMarker) {
  utilBlock += '\n\n' + transformCode(lines.slice(exportMarker.start, docsMarker.start).join('\n'));
}
const addDaysMarker = ordered.find(m => m.name === 'addDays');
const planMarker = ordered.find(m => m.name === 'PlanTab');
if (addDaysMarker && planMarker) {
  utilBlock += '\n\n' + transformCode(lines.slice(addDaysMarker.start, planMarker.start).join('\n'));
}
const buildMarker = ordered.find(m => m.name === 'buildDefaultPacking');
const tripDrawerMarker = ordered.find(m => m.name === 'TripDrawer');
const mergeEnd = ordered.find(m => m.name === 'App');
if (buildMarker && mergeEnd) {
  const tripBlock = transformCode(lines.slice(buildMarker.start, mergeEnd.start).join('\n'));
  fs.writeFileSync(path.join(root, 'src/lib/trip.ts'), header.replace('../', './') + tripBlock);
}

fs.writeFileSync(path.join(root, 'src/lib/attachments.ts'), header.replace('../', './') + utilBlock);

// Write components
for (const [name, relPath] of Object.entries(componentMap)) {
  const m = ordered.find(x => x.name === name);
  if (!m) {
    console.warn('Missing marker:', name);
    continue;
  }
  let chunk = lines.slice(m.start, m.end + 1).join('\n');
  chunk = transformCode(chunk, name === 'App');
  const isApp = name === 'App';
  const h = isApp ? appHeader : header;
  const dir = path.join(root, 'src', path.dirname(relPath));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(root, 'src', relPath), h + chunk + '\n');
  console.log('Wrote', relPath);
}

console.log('Split complete');
