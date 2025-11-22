// Copyright 2020 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { ReadonlyDeep } from 'type-fest';
import type { ThunkAction } from 'redux-thunk';

import { createLogger } from '../../logging/log.std.js';
import { useBoundActions } from '../../hooks/useBoundActions.std.js';
import { NavTab, SettingsPage, DisplayMode } from '../../types/Nav.std.js';
import { beforeNavigateService } from '../../services/BeforeNavigate.std.js';

import type { BoundActionCreatorsMapObject } from '../../hooks/useBoundActions.std.js';
import type { StateType as RootStateType } from '../reducer.preload.js';
import type { Location } from '../../types/Nav.std.js';

// localStorage key for persisting display mode preference
const DISPLAY_MODE_STORAGE_KEY = 'orbital:displayMode';

const log = createLogger('nav');

// Types

function printLocation(location: Location): string {
  if (location.tab === NavTab.Settings) {
    if (location.details.page === SettingsPage.Profile) {
      return `${location.tab}/${location.details.page}/${location.details.state}`;
    }
    return `${location.tab}/${location.details.page}`;
  }

  return `${location.tab}`;
}

// State

export type NavStateType = ReadonlyDeep<{
  selectedLocation: Location;
  displayMode: DisplayMode;
  selectedThreadId: string | undefined;
}>;

// Actions

export const CHANGE_LOCATION = 'nav/CHANGE_LOCATION';
export const SET_DISPLAY_MODE = 'nav/SET_DISPLAY_MODE';
export const SELECT_THREAD = 'nav/SELECT_THREAD';

export type ChangeLocationAction = ReadonlyDeep<{
  type: typeof CHANGE_LOCATION;
  payload: { selectedLocation: Location };
}>;

export type SetDisplayModeAction = ReadonlyDeep<{
  type: typeof SET_DISPLAY_MODE;
  payload: { displayMode: DisplayMode };
}>;

export type SelectThreadAction = ReadonlyDeep<{
  type: typeof SELECT_THREAD;
  payload: { threadId: string | undefined };
}>;

export type NavActionType = ReadonlyDeep<
  ChangeLocationAction | SetDisplayModeAction | SelectThreadAction
>;

// Action Creators

export function changeLocation(
  newLocation: Location
): ThunkAction<void, RootStateType, unknown, NavActionType> {
  return async (dispatch, getState) => {
    const existingLocation = getState().nav.selectedLocation;
    const logId = `changeLocation/${printLocation(newLocation)}`;

    const needToCancel = await beforeNavigateService.shouldCancelNavigation({
      context: logId,
      existingLocation,
      newLocation,
    });

    if (needToCancel) {
      log.info(`${logId}: Canceling navigation`);
      return;
    }

    dispatch({
      type: CHANGE_LOCATION,
      payload: { selectedLocation: newLocation },
    });
  };
}

export function setDisplayMode(
  displayMode: DisplayMode
): ThunkAction<void, RootStateType, unknown, NavActionType> {
  return dispatch => {
    // Persist to localStorage
    try {
      window.localStorage.setItem(DISPLAY_MODE_STORAGE_KEY, displayMode);
    } catch (error) {
      log.warn('Failed to persist display mode to localStorage:', error);
    }

    dispatch({
      type: SET_DISPLAY_MODE,
      payload: { displayMode },
    });
  };
}

export function selectThread(
  threadId: string | undefined
): SelectThreadAction {
  return {
    type: SELECT_THREAD,
    payload: { threadId },
  };
}

export const actions = {
  changeLocation,
  setDisplayMode,
  selectThread,
};

export const useNavActions = (): BoundActionCreatorsMapObject<typeof actions> =>
  useBoundActions(actions);

// Reducer

function getInitialDisplayMode(): DisplayMode {
  try {
    const stored = window.localStorage.getItem(DISPLAY_MODE_STORAGE_KEY);
    if (stored === DisplayMode.Threads) {
      return DisplayMode.Threads;
    }
  } catch (error) {
    log.warn('Failed to read display mode from localStorage:', error);
  }
  return DisplayMode.Chats;
}

export function getEmptyState(): NavStateType {
  return {
    selectedLocation: {
      tab: NavTab.Chats,
    },
    displayMode: getInitialDisplayMode(),
    selectedThreadId: undefined,
  };
}

export function reducer(
  state: Readonly<NavStateType> = getEmptyState(),
  action: Readonly<NavActionType>
): NavStateType {
  if (action.type === CHANGE_LOCATION) {
    return {
      ...state,
      selectedLocation: action.payload.selectedLocation,
    };
  }

  if (action.type === SET_DISPLAY_MODE) {
    return {
      ...state,
      displayMode: action.payload.displayMode,
    };
  }

  if (action.type === SELECT_THREAD) {
    return {
      ...state,
      selectedThreadId: action.payload.threadId,
    };
  }

  return state;
}

// Selectors
export const getDisplayMode = (state: RootStateType): DisplayMode =>
  state.nav.displayMode;

export const getSelectedThreadId = (state: RootStateType): string | undefined =>
  state.nav.selectedThreadId;
