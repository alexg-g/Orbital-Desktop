#!/usr/bin/env tsx

/**
 * Add missing stub exports to callLinks.node.ts
 * This resolves 20+ blocking TypeScript errors from removed Signal features
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = '/Users/alexg/Documents/GitHub/Orbital-Desktop';
const CALL_LINKS_FILE = resolve(REPO_ROOT, 'ts/sql/server/callLinks.node.ts');

// Read current file
const currentContent = readFileSync(CALL_LINKS_FILE, 'utf-8');

// Additional stub exports needed
const additionalStubs = `
// Additional stub exports for disabled call links feature
// These exports are referenced by Storage/Backup services but not used in Orbital

export type InsertOrUpdateCallLinkFromSyncResult = {
  callLink: CallLinkRecord;
  isNew: boolean;
};

export function beginDeleteAllCallLinks(): void {
  // No-op stub
}

export function beginDeleteCallLink(_roomId: string): void {
  // No-op stub
}

export function callLinkExists(_roomId: string): boolean {
  return false;
}

export function defunctCallLinkExists(_roomId: string): boolean {
  return false;
}

export function deleteCallHistoryByRoomId(_roomId: string): void {
  // No-op stub
}

export function deleteCallLinkAndHistory(_roomId: string): void {
  // No-op stub
}

export function deleteCallLinkFromSync(_roomId: string): void {
  // No-op stub
}

export function finalizeDeleteCallLink(_roomId: string): void {
  // No-op stub
}

export function getAllCallLinkRecordsWithAdminKey(): ReadonlyArray<CallLinkRecord> {
  return [];
}

export function getAllDefunctCallLinksWithAdminKey(): ReadonlyArray<CallLinkRecord> {
  return [];
}

export function getAllMarkedDeletedCallLinkRoomIds(): ReadonlyArray<string> {
  return [];
}

export function getCallLinkRecordByRoomId(_roomId: string): CallLinkRecord | undefined {
  return undefined;
}

export function insertDefunctCallLink(_callLink: CallLinkRecord): void {
  // No-op stub
}

export function insertOrUpdateCallLinkFromSync(
  _callLink: CallLinkRecord
): InsertOrUpdateCallLinkFromSyncResult {
  return {
    callLink: _callLink,
    isNew: false
  };
}

export function updateCallLinkState(_roomId: string, _state: any): void {
  // No-op stub
}

export function updateCallLinkStateAndEpoch(
  _roomId: string,
  _state: any,
  _epoch: string
): void {
  // No-op stub
}

export function updateDefunctCallLink(_callLink: Partial<CallLinkRecord>): void {
  // No-op stub
}

// Alias for backwards compatibility
export const _removeAllCallLinks = clearAllCallLinks;
export const getAllAdminCallLinks = getAllCallLinks;
`;

// Append the additional stubs
const newContent = currentContent.trimEnd() + '\n' + additionalStubs;

// Write back
writeFileSync(CALL_LINKS_FILE, newContent, 'utf-8');

console.log('✅ Added missing call links stub exports');
console.log(`📝 File updated: ${CALL_LINKS_FILE}`);
console.log('');
console.log('Added stubs for:');
console.log('  - InsertOrUpdateCallLinkFromSyncResult type');
console.log('  - 18 missing function exports');
console.log('  - 2 backwards compatibility aliases');
console.log('');
console.log('This should resolve 20+ TypeScript errors in:');
console.log('  - ts/sql/Interface.std.ts');
console.log('  - ts/sql/Server.node.ts');
console.log('  - ts/services/storage.preload.ts');
console.log('  - ts/services/backups/*.preload.ts');
