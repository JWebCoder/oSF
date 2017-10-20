// @flow

import {initialStatus} from 'state/reducer'
import type {SyncStatus} from 'state/reducer'

import * as actionTypes from 'state/actionTypes'

export type Action = {
  type: string,
  payload: any
}

export function updateSyncStatus (status: SyncStatus): Action {
  return {
    type: actionTypes.UPDATE_SYNC_STATUS,
    payload: status
  }
}

export function resetSyncStatus (): Action {
  return updateSyncStatus(initialStatus)
}

export function updateSyncProgress (): Action {
  return {
    type: actionTypes.UPDATE_SYNC_PROGRESS,
    payload: {}
  }
}

export function addError (error: {}): Action {
  return {
    type: actionTypes.ADD_ERROR,
    payload: error
  }
}

export default {
  updateSyncStatus,
  resetSyncStatus,
  updateSyncProgress
}
