#!/usr/bin/env node

/**
 * TypeScript Error Analysis Tool
 * Categorizes and prioritizes TypeScript compilation errors
 */

const fs = require('fs');
const path = require('path');

// Read the error log
const errorLog = fs.readFileSync('/tmp/ts-errors.log', 'utf-8');

// Parse errors
const errorLines = errorLog.split('\n').filter(line => line.includes('error TS'));

const errors = errorLines.map(line => {
  const match = line.match(/^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/);
  if (!match) return null;

  const [, filePath, lineNum, colNum, errorCode, message] = match;
  return {
    file: filePath,
    line: parseInt(lineNum),
    column: parseInt(colNum),
    code: errorCode,
    message: message.trim(),
    fullLine: line
  };
}).filter(Boolean);

console.log(`Total errors parsed: ${errors.length}\n`);

// Categorize by error type
const byErrorCode = {};
errors.forEach(err => {
  if (!byErrorCode[err.code]) {
    byErrorCode[err.code] = [];
  }
  byErrorCode[err.code].push(err);
});

// Categorize by file location (Orbital vs Signal)
const orbitalFiles = errors.filter(err =>
  err.file.includes('/orbital/') ||
  err.file.includes('orbitalMedia')
);

const signalFiles = errors.filter(err =>
  !err.file.includes('/orbital/') &&
  !err.file.includes('orbitalMedia')
);

// Categorize by feature area
const categorizeByFeature = (errors) => {
  const categories = {
    'Call Links': [],
    'Call History': [],
    'Backup/Export': [],
    'Distribution Lists': [],
    'Storage': [],
    'Link Preview': [],
    'Components': [],
    'Orbital': [],
    'Other': []
  };

  errors.forEach(err => {
    if (err.file.includes('callLinks') || err.file.includes('callLink')) {
      categories['Call Links'].push(err);
    } else if (err.file.includes('callHistory')) {
      categories['Call History'].push(err);
    } else if (err.file.includes('backups/')) {
      categories['Backup/Export'].push(err);
    } else if (err.file.includes('distribution')) {
      categories['Distribution Lists'].push(err);
    } else if (err.file.includes('storage.preload')) {
      categories['Storage'].push(err);
    } else if (err.file.includes('LinkPreview')) {
      categories['Link Preview'].push(err);
    } else if (err.file.includes('/components/')) {
      categories['Components'].push(err);
    } else if (err.file.includes('orbital') || err.file.includes('Orbital')) {
      categories['Orbital'].push(err);
    } else {
      categories['Other'].push(err);
    }
  });

  return categories;
};

const featureCategories = categorizeByFeature(errors);

// Error type descriptions
const errorDescriptions = {
  'TS6133': 'Unused variable/import',
  'TS2554': 'Argument count mismatch',
  'TS2339': 'Property does not exist',
  'TS2322': 'Type mismatch',
  'TS2345': 'Argument type mismatch',
  'TS2305': 'Module has no exported member',
  'TS2724': 'Module has no exported member (suggestion)',
  'TS2698': 'Spread types issue',
  'TS18046': 'Variable is of type unknown',
  'TS2551': 'Property does not exist (typo suggestion)',
  'TS2353': 'Unknown property in object literal',
  'TS2307': 'Cannot find module',
  'TS2769': 'No overload matches'
};

// Generate report
console.log('='.repeat(80));
console.log('TYPESCRIPT ERROR ANALYSIS REPORT');
console.log('='.repeat(80));
console.log('\n## EXECUTIVE SUMMARY\n');
console.log(`Total errors: ${errors.length}`);
console.log(`Orbital-specific: ${orbitalFiles.length}`);
console.log(`Signal legacy: ${signalFiles.length}`);
console.log(`Auto-fixable (TS6133 unused vars): ${byErrorCode['TS6133']?.length || 0}`);
console.log('\n');

console.log('## ERROR BREAKDOWN BY TYPE\n');
Object.entries(byErrorCode)
  .sort((a, b) => b[1].length - a[1].length)
  .forEach(([code, errs]) => {
    console.log(`${code}: ${errs.length} errors - ${errorDescriptions[code] || 'Unknown'}`);
  });
console.log('\n');

console.log('## ERRORS BY FEATURE AREA\n');
Object.entries(featureCategories)
  .sort((a, b) => b[1].length - a[1].length)
  .forEach(([feature, errs]) => {
    if (errs.length > 0) {
      console.log(`${feature}: ${errs.length} errors`);
    }
  });
console.log('\n');

console.log('='.repeat(80));
console.log('PRIORITY 0: BLOCKING ERRORS (Module resolution issues)');
console.log('='.repeat(80));
console.log('\n');

const blockingErrors = errors.filter(err =>
  ['TS2305', 'TS2724', 'TS2307'].includes(err.code)
);

blockingErrors.forEach(err => {
  console.log(`File: ${err.file}:${err.line}`);
  console.log(`Error: ${err.code} - ${err.message}`);
  console.log('');
});

console.log('='.repeat(80));
console.log('PRIORITY 1: ORBITAL-SPECIFIC ERRORS');
console.log('='.repeat(80));
console.log('\n');

orbitalFiles.forEach(err => {
  console.log(`File: ${err.file}:${err.line}`);
  console.log(`Error: ${err.code} - ${err.message}`);
  console.log('');
});

console.log('='.repeat(80));
console.log('AUTO-FIXABLE: UNUSED VARIABLES/IMPORTS (TS6133)');
console.log('='.repeat(80));
console.log('\n');

const unusedVars = byErrorCode['TS6133'] || [];
console.log(`Total unused variables: ${unusedVars.length}`);
console.log('\nGrouped by file:\n');

const unusedByFile = {};
unusedVars.forEach(err => {
  if (!unusedByFile[err.file]) {
    unusedByFile[err.file] = [];
  }
  unusedByFile[err.file].push(err);
});

Object.entries(unusedByFile)
  .sort((a, b) => b[1].length - a[1].length)
  .forEach(([file, errs]) => {
    console.log(`${file}: ${errs.length} unused items`);
    errs.forEach(err => {
      const varMatch = err.message.match(/'([^']+)'/);
      if (varMatch) {
        console.log(`  - Line ${err.line}: ${varMatch[1]}`);
      }
    });
    console.log('');
  });

// Generate JSON output for programmatic use
const report = {
  summary: {
    total: errors.length,
    orbital: orbitalFiles.length,
    signal: signalFiles.length,
    blocking: blockingErrors.length,
    autoFixable: unusedVars.length
  },
  byErrorCode,
  byFeature: featureCategories,
  blocking: blockingErrors,
  orbital: orbitalFiles,
  unusedVars
};

fs.writeFileSync(
  '/Users/alexg/Documents/GitHub/Orbital-Desktop/ts-error-report.json',
  JSON.stringify(report, null, 2)
);

console.log('\n='.repeat(80));
console.log('Report saved to: ts-error-report.json');
console.log('='.repeat(80));
