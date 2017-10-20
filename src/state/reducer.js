// @flow

import _ from 'lodash'
import * as actionTypes from 'state/actionTypes'

import type {Action} from 'state/actions'

export type SyncStatus = {
  inProgress?: boolean,
  progress?: number,
  steps?: number,
  currentStep?: number
}

export type InitialState = {
  errors: [],
  status: SyncStatus,
  payload: {}
}

export const initialStatus: SyncStatus = {
  inProgress: false,
  progress: 0,
  steps: 0,
  currentStep: 0
}

export const initialState = {
  errors: [],
  status: {
    ...initialStatus
  },
  payload: {}
}

export default function reducer (state: InitialState = initialState, action: Action) {
  switch (action.type) {
    case actionTypes.UPDATE_SYNC_STATUS:
      return {
        ...state,
        status: {
          ...state.status,
          ...action.payload
        }
      }
    case actionTypes.UPDATE_SYNC_PROGRESS:
      const steps: number = state.status.steps ? state.status.steps : 0
      return {
        ...state,
        status: {
          ...state.status,
          progress: Math.min(100, Math.round(state.status.progress + 100 / steps))
        }
      }
    case actionTypes.ADD_ERROR:
      var errors = state.errors
      return _.merge({}, state, {
        errors: errors.concat([action.payload])
      })
    default:
      return state
  }
}
