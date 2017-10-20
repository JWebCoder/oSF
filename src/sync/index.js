// @flow
import {saveSyncUUID, getSyncMetadataObject} from './utils'
import moment from 'moment'
import logger from 'logger'
import actions from 'state/actions'

// redux
import store from 'state/store'

// steps
import ProcessItems from './steps/processItems'
import GetSyncConfig from './steps/getSyncConfig'

import type {SFAPI} from 'sf/api'
import type {DBDriverInterface} from 'DBDriver'
import type {Action} from 'state/actions'
import type {DBItem} from 'types/db'
import type {Routes, AuthAdapter} from 'types'

var R = require('ramda')

export type SyncObject = {
  sync:({searchIndexationActive: boolean}) => void,
  getSyncConfig:() => Promise<{} | void>,
  addSyncStep:({}) => void,
  getSyncMetadataObject:() => Promise<DBItem>
}

export type SyncParams = {
  api: {
    sf: SFAPI
  },
  localApi: DBDriverInterface,
  remoteConfigObject: string,
  routes: Routes,
  auth: AuthAdapter
}

let api: SFAPI
let routes
let localApi: DBDriverInterface
let additionalSteps: {}[]
let auth: AuthAdapter
let remoteConfigObject: string

function addSyncStep (step: {}): void {
  additionalSteps.push(step)
}

function getSyncConfig (): Promise<{} | void> {
  return localApi.getById('sync-config').then(
    (res: DBItem) => {
      return res.config || undefined
    }
  ).catch(
    () => {
      return undefined
    }
  )
}

function startSync (): Promise<any> {
  const action: Action = actions.resetSyncStatus()
  return saveSyncUUID().then(
    () => {
      return Promise.resolve(store.dispatch(action))
    }
  )
}

function dropDatebaseIfNecessary (): Promise<boolean> {
  return getSyncMetadataObject().then(
    (res: DBItem) => {
      if (res.lastSyncDate && moment().diff(moment(res.lastSyncDate), 'days') > 14) {
        // last sync happened before than 14 days ago, we forse a full sync
        // because SF does not allow to retrieve objects deleted before than 14 days ago
        return localApi.wipeDb()
      }
      return true
    }
  )
}

var setupSteps = function (): Promise<any> {
  return Promise.resolve(store.dispatch(actions.updateSyncStatus({
    status: {
      steps: additionalSteps.length + 6 // +1 for each TIME CONSUMING step
    }
  })))
}

var endSync = function (): void {
  store.dispatch(actions.updateSyncStatus({
    status: {
      inProgress: false,
      done: true,
      progress: 100
    }
  }))
}

var incrementProgress = function (): Promise<any> {
  return Promise.resolve(store.dispatch(actions.updateSyncProgress()))
}

function sync (opts = {}): void {
  logger.group('sync')
  logger.info('sync started')
  logger.info('initial state: ', store.getState())

  const searchIndexationFlag = opts.searchIndexationActive || false

  const getSyncConfig = new GetSyncConfig(api, routes, remoteConfigObject)

  const processItems = new ProcessItems(api, routes, auth, store)

  var processSearchIndexes = require('./steps/processSearchIndexes')(store, searchIndexationFlag)
  var processValidationRules = require('./steps/processValidationRules')(api, routes, store)

  var saveLastSyncDate = require('./steps/saveLastSyncDate')(store)
  var storeErrors = require('./steps/storeErrors')(store)
  var sendAttachments = require('./steps/sendAttachments')(api, routes, store)

  var processExtraSteps = require('./steps/processExtraSteps')({
    api: api,
    localApi: localApi,
    store: store,
    actions: actions
  }, additionalSteps)

  var syncProcess = R.pipeP(
    R.pipeP(startSync, incrementProgress),
    R.pipeP(setupSteps, incrementProgress),
    R.pipeP(dropDatebaseIfNecessary, incrementProgress),
    R.pipeP(getSyncConfig, incrementProgress),
    processItems(incrementProgress),
    R.composeP(incrementProgress, sendAttachments),
    R.composeP(incrementProgress, processValidationRules),
    R.composeP(processExtraSteps.bind(null, incrementProgress)),
    R.composeP(incrementProgress, processSearchIndexes),
    R.composeP(incrementProgress, saveLastSyncDate),
    R.composeP(incrementProgress, storeErrors)
  )
  syncProcess()
    .then(function () {
      endSync()
      logger.info('sync succesfully ended', store.getState())
      logger.groupEnd()
    })
    .catch(function (err) {
      endSync()
      logger.error('sync ended with errors', store.getState())
      logger.info('err: ', err)
      logger.info('state: ', store.getState())
      logger.groupEnd()
    })
}

export default function (options: SyncParams): SyncObject {
  api = options.api.sf
  routes = options.routes
  auth = options.auth
  remoteConfigObject = options.remoteConfigObject
  localApi = options.localApi

  additionalSteps = []

  return {
    sync: sync,
    getSyncConfig: getSyncConfig,
    addSyncStep: addSyncStep,
    getSyncMetadataObject: getSyncMetadataObject
  }
}
