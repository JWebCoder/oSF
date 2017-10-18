// @flow

import db from 'db'
import _ from 'lodash'
import cuid from 'cuid'

import type {DBParams, DBQuery, DBResponse, DBItem, DBFile, DBAttachment} from 'types/db'


var utils = require('./utils')
// var validationRulesFactory = require('./validationRules')


var logger = require('./logger')

class DBDriver {
  search (params: DBParams) {
    if (!params.query) {
      params.query = ''
    }

    function queryIndex (): Promise<any> {
      const options: DBQuery = {
        include_docs: true,
        attachments: false,
        limit: params.limit || 50,
        startkey: params.query.toLowerCase(),
        endkey: `${params.query.toLowerCase()}\uffff`

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
        startkey: `${(params.docType || '')}-${params.query.toLowerCase()}`,
        endkey: `${(params.docType || '')}-${params.query.toLowerCase()}\uffff`
      }

      return this.allDocs(options)
    }

    const promise = params.docType
      ? querySpecificDocument()
      : queryIndex()
    return promise.then(
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

  getById (id: string, opts: {}): Promise<any> {
    return getDb().get(id, opts || {})
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

  upsert(objectid: string, docCallback: ({}) => {}): Promise<any>  {
    return db().upsert(objectid, docCallback)
  }

  putIfNotExists (arg: {}): Promise<any> {
    return db().putIfNotExists(arg)
  }

  createOriginalPlaceHolderIfNecessary (docId: string): Promise<any> {
    if (docId && docId.indexOf('-new-') !== -1) {
      // no need to create modified object
      return Promise.resolve()
    }
    // saving a reference to the original model
    // this is gonna be used while pushing back changes to SF,
    // for comparison purposes
    return this.getById(docId)
    .then(
      (res: DBItem) => {
        return this.putIfNotExists('original-' + res._id, res)
      }
    )
  }

  //
  // Internal function not to be used directly (use update() function instead, which performs validation)
  //

  _updateInDB (newDoc: DBItem): Promise<any> {
    return this.createOriginalPlaceHolderIfNecessary(newDoc._id)
    .then(
      () => {
        return this.upsert(
          newDoc._id,
          () => {
            return {
              ...newDoc,
              '@@FW_META@@': utils.mergeFrameworkMetadataObject(newDoc['@@FW_META@@'])
            }
          }
        )
      }
    )
  }
}

module.exports = function () {
  // var validationRules = validationRulesFactory(db)



  function update (newDoc) {
    // we do not do validation for the moment
    return _updateInDB(newDoc)

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

  function getSyncErrors () {
    var errors = {
      conflicts: [],
      others: []
    }
    return getDb()
      .allDocs({
        startkey: 'conflict-',
        endkey: 'conflict-\uffff',
        include_docs: true
      })
      .then(function (res) {
        errors.conflicts = res.rows.map(function (el) {
          return el.doc
        })
        return errors
      })
      .then(function () {
        return getDb().allDocs({
          startkey: 'error-',
          endkey: 'error-\uffff',
          include_docs: true
        })
      })
      .then(function (others) {
        errors.others = others.rows.map(function (el) {
          return el.doc
        })
        return errors
      })
  }

  function removeSyncErrors () {
    return getSyncErrors()
      .then(function (docs) {
        var toBeDeleted = []
        Object.keys(docs).forEach(function (el) {
          docs[el].forEach(function (el) {
            toBeDeleted.push(getDb().remove(el))
          })
        })
        return Promise.all(toBeDeleted)
      })
      .catch(function (err) {
        logger.error(err)
      })
  }

  function keepRemote (conflict) {
    return getDb()
      .remove(conflict)
      .then(function () {
        return getDb().upsert(conflict.original.type + '-' + conflict.original.Id, function (doc) {
          return _.extend(doc, conflict.remote, utils.mergeFrameworkMetadataObject(doc['@@FW_META@@'], {
            forcePush: true
          }))
        })
      })
  }

  function keepLocal (conflict) {
    return getDb()
      .remove(conflict)
      .then(function () {
        return getDb().upsert(conflict.original.type + '-' + conflict.original.Id, function (doc) {
          return _.extend(doc, utils.mergeFrameworkMetadataObject(doc['@@FW_META@@'], {
            forcePush: true
          }))
        })
      })
  }

  function remove (doc) {
    return getDb().remove(doc)
  }

  function deleteLocalObject (docId) {
    return getDb().get(docId)
      .then(function (doc) {
        // in case of new objects not already pushed
        // we just remove them from the database
        // in order not to involve them in the sync process
        if (docId.indexOf('new-') !== -1) {
          return getDb().remove(doc)
        }
        return getDb()
          .putIfNotExists({
            '_id': 'deleted-' + docId
          })
          .then(function () {
            return getDb().remove(doc)
          })
          .then(function () {
            // when we delete local objects
            // we also remove original- placeholder if present
            return getDb().get('original-' + docId)
              .then(function (doc) {
                return getDb().remove(doc)
              })
              .catch(function () {
                return true
              })
          })
      })
  }

  function wipeDb () {
    return getDb()
      .destroy()
      .catch(function (err) {
        logger.error('error while destroyng database', err)
        return true
      })
  }

  return {
    removeSyncErrors: removeSyncErrors,
    getSyncErrors: getSyncErrors,
    createAttachment: createAttachment,
    search: search,
    query: query,
    allDocs: allDocs,
    bulkDocs: bulkDocs,
    getById: getById,
    create: create,
    update: update,
    upsert: upsert,
    putIfNotExists: putIfNotExists,
    keepRemote: keepRemote,
    keepLocal: keepLocal,
    remove: remove,
    deleteLocalObject: deleteLocalObject,
    wipeDb: wipeDb
  }
}
