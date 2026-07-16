#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let js = fs.readFileSync(path.join(root, 'src/legacy/app-body.jsx'), 'utf8');

// Remove React destructure and render bootstrap
js = js.replace(/^const \{ useState, useEffect, useRef \} = React;\n\n/, '');
js = js.replace(/\nReactDOM\.createRoot\(document\.getElementById\("root"\)\)\.render\(<App \/>\);\s*$/, '');
js = js.replace(/React\.Fragment/g, 'Fragment');
js = js.replace(/const L = window\.L;/g, '/* L from leaflet */');

// Constants block -> import (lines until LS)
const constEnd = js.indexOf('/* ── Storage helpers');
const constantsBlock = js.slice(0, constEnd);
js = js.slice(constEnd);

// Remove LS definition (use import)
js = js.replace(/\/\* ── Storage helpers[\s\S]*?};\n\n/, '');

// Replace anthropic API calls with callAi
const taskHints = [
  ['departure day brief', 'brief'],
  ['receipt OCR', 'ocr'],
  ['Extract all receipt', 'ocr'],
  ['travel photo', 'caption'],
  ['caption JSON', 'caption'],
  ['Smart Pack', 'smartpack'],
  ['packing list generator', 'smartpack'],
  ['weather-aware packing', 'recheck'],
  ['visa requirements', 'visa'],
  ['local discovery', 'discovery'],
  ['travel expert', 'tip'],
  ['travel memory writer', 'enhance'],
  ['trip story', 'story'],
];

function inferTask(block) {
  for (const [hint, task] of taskHints) {
    if (block.includes(hint)) return task;
  }
  return 'tip';
}

js = js.replace(
  /const res\s*=\s*await fetch\("https:\/\/api\.anthropic\.com\/v1\/messages",\s*\{[\s\S]*?\}\);\s*\n\s*const (data|d) = await res\.json\(\);/g,
  (block) => {
    const task = inferTask(block);
    const maxMatch = block.match(/max_tokens:\s*(\d+)/);
    const maxTokens = maxMatch ? Number(maxMatch[1]) : 1000;
    const systemMatch = block.match(/system:\s*(`[\s\S]*?`|"[^"]*"|'[^']*')/);
    const system = systemMatch ? systemMatch[1] : 'undefined';
    const messagesMatch = block.match(/messages:\s*(\[[\s\S]*?\])\s*\n?\s*\}\)/);
    const messages = messagesMatch ? messagesMatch[1] : '[{ role: "user", content: "" }]';
    const varName = block.includes('const d =') ? 'd' : 'data';
    return `const ${varName} = { content: [{ text: await callAi({ task: '${task}', system: ${system}, messages: ${messages}, maxTokens: ${maxTokens} }) }] };`;
  }
);

js = js.replace(
  /const res=await fetch\("https:\/\/api\.anthropic\.com\/v1\/messages",\{[\s\S]*?\}\);\s*\n\s*const d=await res\.json\(\);/g,
  `const d = { content: [{ text: await callAi({ task: 'tip', system: "You are a helpful travel expert. Give practical, concise, actionable travel tips. Use bullet points with • symbols. Keep responses under 200 words.", messages: [{ role: 'user', content: aiQuery }], maxTokens: 1000 }) }] };`
);

js = js.replace(/^function App\(/m, 'export default function App(');

const header = `import React, { useState, useEffect, useRef, Fragment } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LS } from './lib/storage';
import { callAi } from './lib/ai';
import {
  DEFAULT_PACKING,
  EXPENSE_CATS,
  CURRENCIES,
  COUNTRY_CURRENCY,
  countryFlag,
  WC_ICON,
  WC_DESC,
} from './lib/constants';

`;

fs.writeFileSync(path.join(root, 'src/App.tsx'), header + js);

// Write constants (extract from original block in legacy file)
const legacy = fs.readFileSync(path.join(root, 'src/legacy/app-body.jsx'), 'utf8');
const legacyConstEnd = legacy.indexOf('/* ── Storage helpers');
let constants = legacy.slice(legacy.indexOf('const DEFAULT_PACKING'), legacyConstEnd);
constants = constants.replace(/^const /gm, 'export const ');
fs.writeFileSync(path.join(root, 'src/lib/constants.ts'), constants);

console.log('Built src/App.tsx');
