// Copyright 2025 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only
import type { KeyboardEvent, ReactNode, RefObject } from 'react';
import React, { useCallback } from 'react';
import type { Placement } from 'react-aria';
import { Dialog, Popover } from 'react-aria-components';
import classNames from 'classnames';
import * as Tooltip from '@radix-ui/react-tooltip';
import { ThemeType } from '../../../types/Util.std.js';

export type FunPopoverProps = Readonly<{
  placement?: Placement;
  theme?: ThemeType;
  triggerRef?: RefObject<Element | null>;
  children: ReactNode;
}>;

export function FunPopover(props: FunPopoverProps): JSX.Element {
  const shouldCloseOnInteractOutside = useCallback(
    (element: Element): boolean => {
      const match = element.closest(
        [
          // Don't close when quill steals focus
          '.module-composition-input__input',
          // Don't close when clicking tooltip
          '.FunTooltip',
        ].join(', ')
      );
      if (match != null) {
        return false;
      }
      return true;
    },
    []
  );

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    event.stopPropagation();
  }, []);

  return (
    <Popover
      data-fun-overlay
      className={classNames('FunPopover', {
        'light-theme': props.theme === ThemeType.light,
        'dark-theme': props.theme === ThemeType.dark,
      })}
      placement={props.placement}
      offset={8}
      triggerRef={props.triggerRef}
      shouldCloseOnInteractOutside={shouldCloseOnInteractOutside}
    >
      <Tooltip.Provider>
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
        <Dialog className="FunPopover__Dialog" onKeyDown={handleKeyDown}>
          {props.children}
        </Dialog>
      </Tooltip.Provider>
    </Popover>
  );
}
