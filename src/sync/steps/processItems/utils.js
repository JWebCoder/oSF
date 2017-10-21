// @flow

import logger from 'logger'
import store from 'state/store'
import actions from 'state/actions'
import dbDriver from 'DBDriver'

// types
import type {DBItem} from 'types/db'
import type {StepObject} from 'sync/steps/getSyncConfig'
import type {SFAPI} from 'sf/api'

export function buildStepFunction (
  obj: StepObject,
  metadataObject: DBItem,
  processLocallyDeletedDocuments: (obj: StepObject) => Promise<any>,
  storeData: (obj: StepObject, lastSyncDate: string) => void
): () => Promise<boolean> {
  return () => {
    logger.group(obj.name)
    store.dispatch(actions.updateSyncStatus({
      status: {
        currentStep: 'Getting SalesForce ' + obj.name
      }
    }))

    return processLocallyDeletedDocuments(obj).then(
      () => {
        return storeData(obj, metadataObject.lastSyncDate || '')
      }
    ).then(
      () => {
        logger.groupEnd(obj.name)
        return true
      }
    ).catch(
      (err: {}) => {
        logger.error('processItems', err)
        logger.groupEnd(obj.name)
        return true
      }
    )
  }
}

export function stepReducer (incrementProgress: (() => Promise<any>)): ((acc: Promise<any>, val: () => Promise<boolean>) => Promise<any>) {
  return (acc: Promise<any>, val: () => Promise<boolean>): Promise<any> => {
    return acc.then(
      () => {
        incrementProgress()
        return val()
      }
    ).catch(
      () => {
        incrementProgress()
        return val()
      }
    )
  }
}

export function deleteRecords (docs: DBItem[], api: SFAPI): Promise<any>[] {
  return docs.map(
    (doc) => {
      const splittedId: string[] = doc.id.split('-')
      return deleteRecord(splittedId[0], splittedId[1], doc, api)
    }
  )
}

export function deleteRecord (objectName: string, id: string, doc: DBItem, api: SFAPI): Promise<any> {
  return api.deleteRecord(objectName, id).then(
    () => {
      return dbDriver.getById(doc.id)
    }
  ).then(
    (fullDoc) => {
      return dbDriver.remove(fullDoc)
    }
  )
}

export default {
  buildStepFunction,
  stepReducer,
  deleteRecords
}
