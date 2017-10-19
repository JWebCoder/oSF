// @flow

import db from 'db'
import _ from 'lodash'
import cuid from 'cuid'
import {mergeFrameworkMetadataObject} from './utils'
import logger from 'logger'

import type {DBParams, DBQuery, DBResponse, DBItem, DBFile, DBAttachment} from 'types/db'

// var validationRulesFactory = require('./validationRules')

class DBDriver {
  search (params: DBParams): Promise<any> {
    if (!params.query) {
      params.query = ''
    }

    const queryIndex = (): Promise<any> => {
      const options: DBQuery = {
        include_docs: true,
        attachments: false,
        limit: params.limit || 50,
        startkey: params.query ? params.query.toLowerCase() : '',
        endkey: `${params.query ? params.query.toLowerCase() : ''}\uffff`
      }

      return this.query(
        params.searchIndex,
        options
      )
    }

    const querySpecificDocument = (): Promise<any> => {
      const options: DBQuery = {
        include_docs: true,
        attachments: false,
        limit: params.limit || 50,
        startkey: `${(params.docType || '')}-${params.query ? params.query.toLowerCase() : ''}`,
        endkey: `${(params.docType || '')}-${params.query ? params.query.toLowerCase() : ''}\uffff`
      }

      return this.allDocs(options)
    }

    const promise: () => Promise<any> = params.docType
      ? querySpecificDocument
      : queryIndex

    return promise().then(
      (res: DBResponse) => {
        res.rows = params.distinct ? _.uniqBy(res.rows || [], 'id') : res.rows
        return res
      }
    )
  }

  allDocs (params: DBQuery): Promise<any> {
    return db().allDocs(params)
  }

  query (doc: string, params: DBQuery): Promise<any> {
    return db().query(doc, params)
  }

  bulkDocs (params: {}): Promise<any> {
    return db().bulkDocs(params)
  }

  getById (id: string, opts?: {}): Promise<any> {
    return db().get(id, opts || {})
  }

  create (objectType: string, initialDoc: {}): Promise<any> {
    const docMerge = (doc: {}): {} => {
      return _.extend(doc,
        initialDoc, {
          'type': objectType,
          '@@FW_META@@': {
            'forceEdit': true // Will cause the edit screen to open in edit mode
          }
        })
    }

    var newId = `${objectType}-new-${cuid()}`

    const promise: Promise<any> = this.upsert(
      newId,
      docMerge
    )
    return promise.then(
      (upsertResult: {}) => {
        return {
          ...upsertResult,
          id: newId
        }
      }
    )
  }

  createAttachment (options: DBFile): Promise<any> {
    var attachments: DBAttachment = {}
    attachments[options.fileName] = {
      content_type: options.contentType || 'text/plain',
      data: options.data
    }

    return db().put({
      _id: `attachment-${options.SFEntityId || ''}-cuid()`,
      _attachments: attachments
    })
  }

  upsert (objectid: string, docCallback: (doc: DBItem) => {}): Promise<any> {
    return db().upsert(objectid, docCallback)
  }

  putIfNotExists (arg: {} | string, doc?: DBItem): Promise<any> {
    if (doc) {
      return db().putIfNotExists(arg, doc)
    } else {
      return db().putIfNotExists(arg)
    }
  }

  createOriginalPlaceHolderIfNecessary (docId: string): Promise<any> {
    if (docId && docId.indexOf('-new-') !== -1) {
      // no need to create modified object
      return Promise.resolve()
    }
    // saving a reference to the original model
    // this is gonna be used while pushing back changes to SF,
    // for comparison purposes
    return this.getById(docId).then(
      (res: DBItem) => {
        return this.putIfNotExists('original-' + res._id, res)
      }
    )
  }

  //
  // Internal function not to be used directly (use update() function instead, which performs validation)
  //

  _updateInDB (newDoc: DBItem): Promise<any> {
    return this.createOriginalPlaceHolderIfNecessary(newDoc._id).then(
      () => {
        return this.upsert(
          newDoc._id,
          () => {
            return {
              ...newDoc,
              '@@FW_META@@': mergeFrameworkMetadataObject(newDoc['@@FW_META@@'])
            }
          }
        )
      }
    )
  }

  update (newDoc: DBItem): Promise<any> {
    // we do not do validation for the moment
    return this._updateInDB(newDoc)

  /*
  // Check that the object is valid
  return validationRules
    .validate(newDoc.type, newDoc)
    .then(function(validationResult) {
      if(validationResult.isValid) {
        // Object is valid : continue processing - return promise that saves to DB
        return _updateInDB(newDoc)
      }
      // Object is not valid : return validation result as error message
      return validationResult
    })
  */
  }

  getSyncErrors (): Promise<any> {
    let errors = {
      conflicts: [],
      others: []
    }

    const conflicts = this.allDocs({
      startkey: 'conflict-',
      endkey: 'conflict-\uffff',
      include_docs: true
    })

    const others = this.allDocs({
      startkey: 'error-',
      endkey: 'error-\uffff',
      include_docs: true
    })

    return Promise.all([conflicts, others]).then(
      (res: DBResponse[]) => {
        errors.conflicts = res[0].rows.map(
          (el) => {
            return el.doc
          }
        )
        errors.others = res[1].rows.map(
          (el) => {
            return el.doc
          }
        )
        return errors
      }
    )
  }

  removeSyncErrors (): Promise<any> {
    return this.getSyncErrors().then(
      (docs: {conflicts: DBItem[], others: DBItem[]}) => {
        let toBeDeleted = []
        Object.keys(docs).forEach(
          (key) => {
            docs[key].forEach(
              (doc) => {
                toBeDeleted.push(this.remove(doc))
              }
            )
          }
        )
        return Promise.all(toBeDeleted)
      }
    ).catch(
      (err: {}) => {
        logger.error(err)
      }
    )
  }

  remove (doc: DBItem): Promise<any> {
    return db().remove(doc)
  }

  keepRemote (conflict: DBItem): Promise<any> {
    return this.remove(conflict).then(
      () => {
        if (conflict.original && conflict.original.type && conflict.original.Id && conflict.remote) {
          return this.upsert(
            conflict.original.type + '-' + conflict.original.Id,
            (doc: DBItem) => {
              return _.extend(doc, conflict.remote, mergeFrameworkMetadataObject(doc['@@FW_META@@'], {
                forcePush: true
              }))
            }
          )
        } else {
          throw new Error('Error')
        }
      }
    )
  }

  keepLocal (conflict: DBItem): Promise<any> {
    return this.remove(conflict).then(
      () => {
        if (conflict.original && conflict.original.type && conflict.original.Id) {
          return this.upsert(
            conflict.original.type + '-' + conflict.original.Id,
            (doc) => {
              return _.extend(doc, mergeFrameworkMetadataObject(doc['@@FW_META@@'], {
                forcePush: true
              }))
            }
          )
        } else {
          throw new Error('Error')
        }
      }
    )
  }

  deleteLocalObject (docId: string): Promise<any> {
    return this.getById(docId).then(
      (doc: DBItem) => {
        // in case of new objects not already pushed
        // we just remove them from the database
        // in order not to involve them in the sync process
        if (docId.indexOf('new-') === -1) {
          this.putIfNotExists({
            '_id': 'deleted-' + docId
          })
        }

        return this.remove(doc)
      }
    ).then(
      () => {
        // when we delete local objects
        // we also remove original- placeholder if present
        return this.getById('original-' + docId)
      }
    ).then(
      (doc?: DBItem) => {
        if (doc) {
          return this.remove(doc)
        }

        return true
      }
    ).then(
      () => {
        return true
      }
    ).catch(
      () => {
        return true
      }
    )
  }

  wipeDb (): Promise<any> {
    return db().destroy().catch(
      (err: {}) => {
        logger.error('error while destroyng database', err)
        return true
      }
    )
  }
}

const dbDriver = new DBDriver()

export default dbDriver
