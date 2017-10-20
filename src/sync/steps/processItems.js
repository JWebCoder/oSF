import logger from 'logger'

var _ = require('lodash')
var us = require('underscore.string')
var utils = require('../utils.js')
var moment = require('moment')
var errors = require('../errors')

var actions = require('../redux/actions')
var getDb = require('../getDb')

export default function (api, routes, auth, store) {
  function getRequestForDeletedObjects (objectName) {
    // SF prevents to query for objects deleted more than 30 days ago.
    var startDate = encodeURIComponent(moment().utc().subtract(29, 'd').format())
    var endDate = encodeURIComponent(moment().utc().format())
    var path = routes.delete + objectName + '/deleted/?start=' + startDate + '&end=' + endDate
    return {
      path: path
    }
  }

  function processLocallyDeletedDocuments (obj) {
    logger.log('processLocallyDeletedDocuments')
    return getDb().allDocs({
      startkey: 'deleted-' + obj.name + '-',
      endkey: 'deleted-' + obj.name + '-\uffff'
    })
      .then(function (docs) {
        return Promise.all(
          docs.rows.map(function (doc) {
            var splittedId = doc.id.split('-')
            return api
              .delete(splittedId[1], splittedId[2])
              .then(function (res) {
                return getDb()
                  .get(doc.id)
                  .then(function (fullDoc) {
                    return getDb().remove(fullDoc)
                  })
              })
          }))
      })
      .catch(function (err) {
        logger.error('error: ', err)
        logger.error('processLocallyDeletedDocuments')
        return true
      })
  }

  function recursivelyLoadRecordsFromSalesforce (arg) {
    logger.info('recursivelyLoadRecordsFromSalesforce')
    var remoteDocs = arg.sfResult.records.map(function (record) {
      return _.extend({}, {
        _id: arg.sfObject.name + '-' + record.Id,
        type: arg.sfObject.name
      }, getFieldsFilteredRecord(arg.layouts, record))
    })

    // 2. Process retrieved docs
    // First, we will try bulk insert : this will make first sync faster.
    // PouchDB will give an error for each doc that already exists in the DB
    var future = getDb().bulkDocs(remoteDocs)
      .then(function (result) {
        var docsInError = []
        var docsLength = remoteDocs.length
        for (var i = 0; i < docsLength; i++) {
          if (result[i].error) {
            docsInError.push(remoteDocs[i])
          }
        }
        return docsInError
      })
      .then(function (docsInError) {
        logger.info('processing docs already present in db', docsInError)
        // these are the docs that were already present in the DB
        return Promise
          .all(docsInError.map(function (errDoc) {
            return getDb().get(errDoc._id)
          }))
          .then(function (localObjects) {
            return localObjects.filter(function (el) {
              return !el['@@FW_META@@'] || !el['@@FW_META@@'].forcePush
            })
          })
          .then(function (localObjects) {
            return Promise.all(
              localObjects
                .map(function (localObjects) {
                  var errDoc = _.find(docsInError, {
                    '_id': localObjects._id
                  })
                  return getDb()
                    .get('original-' + errDoc._id)
                    .then(function (res) {
                      logger.info('conflict detected', errDoc._id)
                      // the document has been modified locally and in SF
                      // save it as a conflicting document
                      return getDb()
                        .upsert('conflict-' + errDoc._id, function (doc) {
                          return _.extend(doc, {
                            original: res,
                            remote: errDoc
                          })
                        })
                        .then(function (newDoc) {
                          return newDoc
                        })
                    })
                    .catch(function (err) {
                      if (err.status === 404) {
                        console.log('The document ' + errDoc._id + ' has been modified only on SF: overwriting local one with remote one')
                        // the document has been modified only on SF
                        // we just update it locally
                        return getDb()
                          .upsert(errDoc._id, function (doc) {
                            return _.extend(doc, errDoc)
                          })
                          .then(function (result) {
                            return result
                          })
                      }
                    })
                })
            )
          })
      })

    if (arg.sfResult.done) {
      return future
    } else {
      // 3. Do the same with results obtained by calling nextRecordsUrl.
      return future
        .then(function () {
          // the nextRecordsUrl is coming from salesforce in this shape:
          // nextRecordsUrl: "/services/data/v34.0/query/01g3B0000017e8WQAQ-500"
          // we only need the last part, because the rest is handled from within the routes,
          // so we use routes.query which is "/services/data/v34.0"
          return api.get({
            path: routes.query + '/' + _.last(arg.sfResult.nextRecordsUrl.split('/'))
          })
        })
        .then(function (res) {
          return {
            sfObject: arg.sfObject,
            sfResult: res
          }
        })
        .then(recursivelyLoadRecordsFromSalesforce)
    }
  }

  function pushNewDocuments (arg) {
    logger.info('pushing new documents :pushNewDocuments()')
    return Promise.all(
      arg.data.map(function (docToPush) {
        return api.create(arg.sfObject.name, docToPush.doc)
          .then(function (res) {
            // Doc pushed to SF : remove it from local DB (it will be read from SF with its SF ID in following steps)
            return getDb().remove(docToPush.doc)
          })
          .catch(function (err) {
            // Failure. Report as error but do not halt process
            if (!err.response || !err.response.body) {
              err.response = {
                body: []
              }
            }
            err.response.body.push({
              message: 'Failed to push new ' + arg.sfObject.name
            })
            store.dispatch(actions.addError(errors.handlePushNewError(docToPush, err)))
          })
      })
    )
  }

  function pushChanges (arg) {
    logger.info('pushing locally updated documents :pushChanges()')
    return Promise.all(arg.data.map(function (obj) {
      return getDb()
        .get(us.strRight(obj.doc._id, 'original-'))
        .then(function (res) {
          var delta = utils.difference(obj.doc, res)
          return api.update(arg.sfObject.name, obj.doc.Id, delta)
        })
        .then(function (res) {
          return api.get({
            path: routes.genericObjects + arg.sfObject.name + '/' + obj.doc.Id
          })
        })
        .then(function () {
          return getDb().remove(obj.doc)
        })
        .catch(function (err) {
          // handle server errors
          if (err.status === 400) {
            store.dispatch(actions.addError(errors.handleValidationServerError(obj, err)))
          } else {
            store.dispatch(actions.addError(errors.handleGenericServerError(err)))
          }
        })
    }))
  }

  function processDeletedRecords (arg) {
    logger.info('processing remotely deleted documents :processDeletedRecords()')
    if (arg.sfResult && arg.sfResult.deletedRecords) {
      var sequence = arg.sfResult.deletedRecords.map(function (dr) {
        return function () {
          return getDb().get(arg.sfObject.name + '-' + dr.id)
            .then(function (doc) {
              return getDb().remove(doc)
            })
            .catch(function (err) {
              if (err.status !== 404) {
                logger.error('Error in processDeletedRecords()', err)
              }
            })
        }
      })
      return sequence.reduce(function (cur, next) {
        return cur
          .then(function () {
            return next()
          })
          .catch(function () {
            return next()
          })
      }, Promise.resolve())
        .then(function () {
          return arg
        })
    } else {
      return Promise.resolve(arg)
    }
  }

  function getLayouts (object) {
    logger.info('getting layout :getLayouts()')
    if (object.hasLayouts) {
      return api
        .get({
          path: routes.layouts + object.name + '/describe/layouts'
        })
        .then(function (res) {
          var available = res.recordTypeMappings.filter(function (el) {
            return el.available
          })
          return Promise.all(available.map(function (el) {
            return api
              .get({
                path: (routes.layout + el.urls.layout).replace('//', '/')
              })
              .then(function (res) {
                var id = 'layouts-' + object.name + '-' + el.recordTypeId
                return getDb().upsert(id, function (doc) {
                  return res
                })
                .then(function () {
                  return res
                })
              })
          }))
        })
    } else {
      return Promise.resolve(null)
    }
  }

  function getFieldsUsedInLayouts (layouts, fields) {
    var allFields = fields.map(function (el) {
      return el.name
    })
    if (!layouts) {
      return allFields
    }
    var finalFields = ['Id']
    if (allFields.indexOf('RecordTypeId') !== -1) {
      finalFields.push('RecordTypeId')
    }
    layouts.forEach(function (layout) {
      addFieldsFromLayout(layout, function (val) {
        if (finalFields.indexOf(val) === -1 && allFields.indexOf(val) !== -1) {
          finalFields.push(val)
        }
      })
    })
    return finalFields
  }

  function addFieldsFromLayout (layout, cb) {
    var layoutKeys = ['editLayoutSections', 'detailLayoutSections']
    layoutKeys.forEach(function (l) {
      layout[l].forEach(function (lItem) {
        lItem.layoutRows.forEach(function (r) {
          r.layoutItems.forEach(function (i) {
            i.layoutComponents.forEach(function (c) {
              cb(c.value)
            })
          })
        })
      })
    })
  }

  function getFieldsFilteredRecord (layouts, record) {
    if (!layouts) {
      return record
    }
    var layout = layouts.length === 1 // in case of single layout, we don'n probably have a recordTypeId in the SF object
      ? layouts[0]
    : layouts.filter(function (l) {
      return l._id.split('-')[2] === record.RecordTypeId
    })[0]
    var finalRecord = {
      Id: record.Id,
      RecordTypeId: record.RecordTypeId
    }
    addFieldsFromLayout(layout, function (val) {
      if (typeof finalRecord[val] === 'undefined' && typeof record[val] !== 'undefined') {
        finalRecord[val] = record[val]
      }
    })
    return finalRecord
  }

  function storeData (object, lastSyncDate) {
    logger.info('storeData()')
    return getDb()
      .allDocs({
        startkey: object.name + '-new-',
        endkey: object.name + '-new-\uffff',
        include_docs: true
      })
      .then(function (res) {
        return {
          data: res.rows,
          sfObject: object
        }
      })
      .then(function (res) {
        return pushNewDocuments(res)
      })
      .then(function (res) {
        return api
          .get({
            path: routes.genericObjects + object.name + '/describe/'
          })
      })
      .then(function (res) {
        return getLayouts(object)
          .then(function (layouts) {
            return {
              fields: getFieldsUsedInLayouts(layouts, res.fields),
              layouts: layouts
            }
          })
      })
      .then(function (res) {
        return api.query(utils.buildSelectObjectQuery(res.fields, object, lastSyncDate, auth.getUser()))
          .then(function (respones) {
            return {
              sfObject: object,
              sfResult: respones,
              layouts: res.layouts

            }
          })
          .then(recursivelyLoadRecordsFromSalesforce)
          .then(function (res) {
            return api.get(getRequestForDeletedObjects(object.name, lastSyncDate))
          })
          .catch(function (err) {
            logger.error('Error while fetching remotely deleted docs: ', err)
            return {}
          })
          .then(function (res) {
            return {
              sfObject: object,
              sfResult: res
            }
          })
          .then(processDeletedRecords)
          .then(function (res) {
            // Load docs locally modified, and not conflicting
            return getDb().allDocs({
              startkey: 'original-' + object.name + '-',
              endkey: 'original-' + object.name + '-\uffff',
              include_docs: true
            })
              .then(function (originals) {
                return getDb().allDocs({
                  startkey: 'conflict-' + object.name + '-',
                  endkey: 'conflict-' + object.name + '-\uffff',
                  include_docs: true
                })
                  .then(function (conflicting) {
                    // push only documents that are not marked as conflicting
                    return originals.rows.filter(function (el) {
                      return !_.find(conflicting.rows, {
                        id: el.id.replace('original', 'conflict')
                      })
                    })
                  })
              })
          })
          .then(function (docsToPush) {
            // Prepare args for next step
            return {
              sfObject: object,
              data: docsToPush
            }
          })
          .then(function (res) {
            return pushChanges(res)
          })
          .then(function () {
            return true
          })
          .catch(function (err) {
            logger.error('storeData', err)
            return true
          })
      })
  }

  return function processItems (incrementProgress) {
    return function () {
      logger.group('processItems')
      var state = store.getState()
      var steps = state.payload.map(function (obj) {
        return function () {
          return utils.getSyncMetadataObject(obj)
            .then(function (metadataObject) {
              logger.group(obj.name)
              store.dispatch(actions.updateSyncStatus({
                status: {
                  currentStep: 'Getting SalesForce ' + obj.name
                }
              }))
              return processLocallyDeletedDocuments(obj)
                .then(function () {
                  return storeData(obj, metadataObject.lastSyncDate)
                })
            })
            .then(function () {
              logger.groupEnd(obj.name)
              return true
            })
            .catch(function (err) {
              logger.error('processItems', err)
              logger.groupEnd(obj.name)
              return true
            })
        }
      })

      // process in sequence
      var sequence = steps.reduce(function (acc, val) {
        return acc
          .then(function () {
            incrementProgress()
            return val()
          })
          .catch(function () {
            incrementProgress()
            return val()
          })
      }, Promise.resolve(incrementProgress))

      return sequence
        .then(function () {
          logger.groupEnd('processItems')
        })
        .catch(function () {
          logger.groupEnd('processItems')
          logger.info('error-state: ', store.getState())
        })
    }
  }
}
