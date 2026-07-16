#!/usr/bin/env node
/**
 * Split generated App.tsx into component modules.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
const lines = app.split('\n');

const chunks = [
  { file: 'lib/attachments.ts', start: 15, end: 61 },
  { file: 'components/shared/AttachStrip.tsx', start: 61, end: 96 },
  { file: 'components/shared/ViewerModal.tsx', start: 96, end: 153 },
  { file: 'lib/export.ts', start: 153, end: 389 },
  { file: 'components/tabs/DocsTab.tsx', start: 389, end: 601 },
  { file: 'components/shared/SwipeableActivity.tsx', start: 601, end: 739 },
  { file: 'components/tabs/Dashboard.tsx', start: 739, end: 1249 },
  { file: 'lib/calendar.ts', start: 1249, end: 1348 },
  { file: 'components/tabs/PlanTab.tsx', start: 1348, end: 1526 },
  { file: 'components/tabs/PackTab.tsx', start: 1526, end: 2291 },
  { file: 'components/shared/ShareModal.tsx', start: 2291, end: 2663 },
  { file: 'components/tabs/BudgetTab.tsx', start: 2663, end: 3745 },
  { file: 'lib/explore.ts', start: 3745, end: 3771 },
  { file: 'components/tabs/ExploreTab.tsx', start: 3771, end: 4591 },
  { file: 'components/tabs/MemoriesTab.tsx', start: 4591, end: 5206 },
  { file: 'lib/trip.ts', start: 5206, end: 5244 },
  { file: 'components/shared/TripDrawer.tsx', start: 5244, end: 5344 },
  { file: 'lib/sync.ts', start: 5344, end: 5375 },
  { file: 'App.tsx', start: 5375, end: lines.length },
];

const reactImport = `import React, { useState, useEffect, useRef, Fragment } from 'react';
import L from 'leaflet';
`;

const appHeader = `import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LS } from './lib/storage';
import { callAi } from './lib/ai';
import {
  DEFAULT_PACKING, EXPENSE_CATS, CURRENCIES, COUNTRY_CURRENCY,
  countryFlag, WC_ICON, WC_DESC,
} from './lib/constants';
import { buildDefaultPacking, snapshotTrip, restoreTrip } from './lib/trip';
import { mergeById, mergePeople, mergeItinerary, mergePacking } from './lib/sync';
import { ShareModal } from './components/shared/ShareModal';
import { TripDrawer } from './components/shared/TripDrawer';
import { Dashboard } from './components/tabs/Dashboard';
import { PlanTab } from './components/tabs/PlanTab';
import { PackTab } from './components/tabs/PackTab';
import { BudgetTab } from './components/tabs/BudgetTab';
import { ExploreTab } from './components/tabs/ExploreTab';
import { MemoriesTab } from './components/tabs/MemoriesTab';
import { DocsTab } from './components/tabs/DocsTab';

const JSONBLOB = "https://jsonblob.com/api/jsonBlob";

`;

const extraImports = {
  'lib/attachments.ts': `import { LS } from './storage';\n`,
  'lib/export.ts': `import { LS } from './storage';\nimport { countryFlag } from './constants';\n`,
  'lib/calendar.ts': `import { LS } from './storage';\n`,
  'lib/explore.ts': `import { LS } from './storage';\n`,
  'lib/trip.ts': `import { LS } from './storage';\nimport { DEFAULT_PACKING } from './constants';\n`,
  'lib/sync.ts': `import { LS } from './storage';\nimport { DEFAULT_PACKING } from './constants';\n`,
  'components/shared/AttachStrip.tsx': `${reactImport}import { processFiles } from '../../lib/attachments';\n`,
  'components/shared/ViewerModal.tsx': `${reactImport}import { isImage, isPDF } from '../../lib/attachments';\n`,
  'components/shared/SwipeableActivity.tsx': `${reactImport}\n`,
  'components/shared/ShareModal.tsx': `${reactImport}import { LS } from '../../lib/storage';\nimport { EXPENSE_CATS } from '../../lib/constants';\n`,
  'components/shared/TripDrawer.tsx': `${reactImport}import { LS } from '../../lib/storage';\n`,
  'components/tabs/DocsTab.tsx': `${reactImport}import { LS } from '../../lib/storage';\nimport { EXPENSE_CATS } from '../../lib/constants';\nimport { processFiles, formatBytes, isImage, isPDF } from '../../lib/attachments';\nimport { AttachStrip } from '../shared/AttachStrip';\nimport { ViewerModal } from '../shared/ViewerModal';\nimport { generateExportHTML } from '../../lib/export';\n`,
  'components/tabs/Dashboard.tsx': `${reactImport}import { LS } from '../../lib/storage';\nimport { EXPENSE_CATS, WC_ICON, WC_DESC, countryFlag } from '../../lib/constants';\nimport { callAi } from '../../lib/ai';\n`,
  'components/tabs/PlanTab.tsx': `${reactImport}import { LS } from '../../lib/storage';\nimport { EXPENSE_CATS } from '../../lib/constants';\nimport { SwipeableActivity } from '../shared/SwipeableActivity';\nimport { addDays, generateICS, downloadICS, gcalDayUrl, outlookDayUrl } from '../../lib/calendar';\n`,
  'components/tabs/PackTab.tsx': `${reactImport}import { LS } from '../../lib/storage';\nimport { DEFAULT_PACKING, WC_ICON, WC_DESC } from '../../lib/constants';\nimport { callAi } from '../../lib/ai';\n`,
  'components/tabs/BudgetTab.tsx': `${reactImport}import { LS } from '../../lib/storage';\nimport { EXPENSE_CATS, CURRENCIES, countryFlag } from '../../lib/constants';\nimport { callAi } from '../../lib/ai';\nimport { compressImage, processFiles, isImage } from '../../lib/attachments';\nimport { AttachStrip } from '../shared/AttachStrip';\nimport { ViewerModal } from '../shared/ViewerModal';\n`,
  'components/tabs/ExploreTab.tsx': `${reactImport}import { LS } from '../../lib/storage';\nimport { WC_ICON, WC_DESC, countryFlag } from '../../lib/constants';\nimport { callAi } from '../../lib/ai';\nimport { detectPlatform, platformLinks } from '../../lib/explore';\n`,
  'components/tabs/MemoriesTab.tsx': `${reactImport}import { LS } from '../../lib/storage';\nimport { callAi } from '../../lib/ai';\nimport { compressImage } from '../../lib/attachments';\n`,
};

function patch(chunk, file) {
  let c = chunk;
  if (file !== 'App.tsx') {
    c = c.replace(/^export (function|const) /gm, '$1 ');
    c = c.replace(/^function (\w+)/gm, 'export function $1');
    c = c.replace(/^const (\w+)\s*=/gm, 'export const $1 =');
  }
  return c;
}

function headerFor(file) {
  if (file === 'App.tsx') return appHeader;
  return extraImports[file] || reactImport;
}

for (const ch of chunks) {
  const slice = lines.slice(ch.start, ch.end).join('\n');
  const header = headerFor(ch.file);
  const body = patch(slice, ch.file);
  const out = path.join(root, 'src', ch.file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, header + body + '\n');
  console.log('Wrote', ch.file);
}

console.log('Component split complete');
