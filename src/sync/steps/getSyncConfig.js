// @flow

import logger from 'logger'
import actions from 'state/actions'
import store from 'state/store'
import db from 'DBDriver'

import {buildSelectObjectQuery} from 'sf/utils'

import type {SFAPI} from 'sf/api'
import type {Routes} from 'types'

export type SFObject = {
  Name: string,
  IndexName__c: string,
  IndexMapFunction__c: string,
  hasLayouts__c: string,
  Query__c: string,
  NewRecordTypeId__c: string
}

export default class getSyncConfig {
  api: SFAPI
  routes: Routes
  remoteConfigObject: string

  constructor (
    api: SFAPI,
    routes: Routes,
    remoteConfigObject: string
  ) {
    this.api = api
    this.routes = routes
    this.remoteConfigObject = remoteConfigObject
  }

  getSyncConfig () {
    logger.group('getSyncConfig')
    store.dispatch(actions.updateSyncStatus({
      status: {
        currentStep: 'Getting SalesForce configuration'
      }
    }))
    return this.api.get({
      path: this.routes.syncConfigPath
    }).then(
      readFieldNames
    ).then(
      (fields: string[]) => {
        return this.api.query(buildSelectObjectQuery(fields, {
          name: this.remoteConfigObject
        }))
      }
    ).then(
      (res: {records: []}) => {
        return res.records.map(function (el: SFObject) {
          // normalize data
          return {
            name: el.Name,
            indexName: el.IndexName__c,
            indexMapFunction: el.IndexMapFunction__c,
            hasLayouts: el.hasLayouts__c,
            soql: el.Query__c,
            newRecordTypeId: el.NewRecordTypeId__c
          }
        })
      }
    ).then(
      (syncConfig) => {
        // Store the syncConfig object and return it
        db.upsert(
          'sync-config',
          (doc: {}) => {
            return {
              ...doc,
              config: syncConfig
            }
          }
        )
        store.dispatch(actions.updateSyncStatus({
          payload: syncConfig
        }))
        logger.info('state: ', store.getState())
        logger.groupEnd('getSyncConfig')
      })
      .catch(function (err: {}) {
        logger.error('error: ', err)
        logger.info('state: ', store.getState())
        logger.groupEnd('getSyncConfig')
      })
  }
}

// Used after a call to API */describe to get the list of fields in an array
function readFieldNames (res: {fields: {name: string}[]}): string[] {
  return res.fields.map(
    (field) => field.name
  )
}
