// @flow

import db from 'DBDriver'
import cuid from 'cuid'
import _ from 'lodash'

import type {DBItem, Original, Override} from 'types/db'

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

export function difference (original: Original | {}, override: Override): {} {
  var ret = {}
  for (var name in original) {
    if (name in override) {
      if (_.isObject(override[name]) && !_.isArray(override[name])) {
        var diff = difference(original[name], override[name])
        if (!_.isEmpty(diff)) {
          ret[name] = diff
        }
      } else if (!_.isEqual(original[name], override[name])) {
        ret[name] = override[name]
      }
    }
  }

  // Retain our metadata, they will be filtered out by the SF adapter just before push
  if (override['@@FW_META@@'] !== undefined) {
    ret['@@FW_META@@'] = override['@@FW_META@@']
  }

  return ret
}
