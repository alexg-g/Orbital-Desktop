// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React from 'react';
import { OrbitalSettingsSection } from './OrbitalSettingsControl';

export function OrbitalSettingsFiles(): JSX.Element {
  return (
    <div className="OrbitalSettingsFiles">
      <div className="OrbitalSettingsFiles__coming-soon">
        <div className="OrbitalSettingsFiles__icon">📁</div>
        <h3 className="OrbitalSettingsFiles__title">File Library</h3>
        <p className="OrbitalSettingsFiles__description">
          Coming soon! The File Library will let you browse and manage all files
          shared in your orbit, organized by thread, date, and file type.
        </p>
      </div>

      <OrbitalSettingsSection title="Planned Features">
        <div className="OrbitalSettingsFiles__features">
          <ul>
            <li>📸 Browse all shared images and videos</li>
            <li>📄 View documents and files</li>
            <li>🗂️ Organize by thread or chat</li>
            <li>📅 Filter by date range</li>
            <li>🔍 Search file names and content</li>
            <li>💾 Download files to your device</li>
          </ul>
        </div>
      </OrbitalSettingsSection>
    </div>
  );
}
