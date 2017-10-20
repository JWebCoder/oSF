// @flow

import db from 'DBDriver'
import cuid from 'cuid'

import type {DBItem} from 'types/db'

export function saveSyncUUID (): Promise<DBItem> {
  return db.upsert(
    'syncProcess-metadata',
    (doc: DBItem) => {
      return {
        ...doc,
        uuid: cuid()
      }
    }
  )
}

export function getSyncMetadataObject (): Promise<DBItem> {
  return db.getById('syncProcess-metadata').then(
    (doc: DBItem) => {
      return doc
    }
  )
}
