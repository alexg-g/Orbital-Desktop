// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React from 'react';

// Toggle switch component
export type OrbitalToggleProps = {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
};

export function OrbitalToggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: OrbitalToggleProps): JSX.Element {
  return (
    <div className="OrbitalSettingsControl OrbitalSettingsControl--toggle">
      <div className="OrbitalSettingsControl__label">
        <span className="OrbitalSettingsControl__label-text">{label}</span>
        {description && (
          <span className="OrbitalSettingsControl__description">{description}</span>
        )}
      </div>
      <label className="OrbitalToggle">
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          disabled={disabled}
        />
        <span className="OrbitalToggle__slider" />
      </label>
    </div>
  );
}

// Select dropdown component
export type OrbitalSelectOption = {
  value: string;
  label: string;
};

export type OrbitalSelectProps = {
  label: string;
  description?: string;
  options: Array<OrbitalSelectOption>;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function OrbitalSelect({
  label,
  description,
  options,
  value,
  onChange,
  disabled,
}: OrbitalSelectProps): JSX.Element {
  return (
    <div className="OrbitalSettingsControl OrbitalSettingsControl--select">
      <div className="OrbitalSettingsControl__label">
        <span className="OrbitalSettingsControl__label-text">{label}</span>
        {description && (
          <span className="OrbitalSettingsControl__description">{description}</span>
        )}
      </div>
      <select
        className="OrbitalSelect"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// Section divider with title
export type OrbitalSettingsSectionProps = {
  title: string;
  children: React.ReactNode;
};

export function OrbitalSettingsSection({
  title,
  children,
}: OrbitalSettingsSectionProps): JSX.Element {
  return (
    <div className="OrbitalSettingsSection">
      <h3 className="OrbitalSettingsSection__title">{title}</h3>
      <div className="OrbitalSettingsSection__content">{children}</div>
    </div>
  );
}

// Button component for actions
export type OrbitalSettingsButtonProps = {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
};

export function OrbitalSettingsButton({
  label,
  onClick,
  variant = 'secondary',
  disabled,
}: OrbitalSettingsButtonProps): JSX.Element {
  return (
    <button
      type="button"
      className={`OrbitalSettingsButton OrbitalSettingsButton--${variant}`}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
}

// Info row for read-only display
export type OrbitalSettingsInfoProps = {
  label: string;
  value: string;
};

export function OrbitalSettingsInfo({
  label,
  value,
}: OrbitalSettingsInfoProps): JSX.Element {
  return (
    <div className="OrbitalSettingsControl OrbitalSettingsControl--info">
      <span className="OrbitalSettingsControl__label-text">{label}</span>
      <span className="OrbitalSettingsControl__value">{value}</span>
    </div>
  );
}
