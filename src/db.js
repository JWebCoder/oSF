// @flow

import PouchDB from 'pouchdb'
import PouchDBUpsert from 'pouchdb-upsert'
import PouchDBAdapterCordovaSqlite from 'pouchdb-adapter-cordova-sqlite'

PouchDB.plugin(PouchDBUpsert)

const adapter = window.cordova ? 'cordova-sqlite' : 'websql'

if (window.cordova) {
  PouchDB.plugin(PouchDBAdapterCordovaSqlite)
}

let db: PouchDB | void

const buildDB = (): PouchDB => {
  if (!db || db._destroyed) {
    db = new PouchDB('pouchfm', {
      adapter: process.env.NODE_ENV !== 'test' && adapter,
      'revs_limit': 1
    })
  }

  return db
}

export default buildDB
