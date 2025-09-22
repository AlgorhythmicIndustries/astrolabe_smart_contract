#!/usr/bin/env tsx
/**
 * Simple test runner for SDK tests
 */

import { execSync } from 'child_process';
import { readdirSync } from 'fs';
import { join } from 'path';

const testsDir = __dirname;
const testFiles = readdirSync(testsDir)
  .filter(file => file.endsWith('.test.ts'))
  .sort(); // Ensure tests run in alphabetical order (00-, 01-, 02-, etc.)

console.log('🧪 Running SDK Tests in order...\n');
console.log('📋 Test execution order:');
testFiles.forEach((file, i) => console.log(`  ${i + 1}. ${file}`));
console.log('');

let passed = 0;
let failed = 0;

for (const testFile of testFiles) {
  const testPath = join(testsDir, testFile);
  console.log(`📋 Running: ${testFile}`);
  
  try {
    execSync(`npx tsx "${testPath}"`, { 
      stdio: 'inherit',
      cwd: join(testsDir, '..') // Run from SDK directory
    });
    console.log(`✅ ${testFile} passed\n`);
    passed++;
  } catch (error) {
    console.error(`❌ ${testFile} failed\n`);
    failed++;
  }
}

console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
