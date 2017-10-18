var cuid = require('cuid')
var _ = require('lodash')
var logger = require('./logger')
var getDb = require('./getDb')

var localErrors = []

function buildError (err, id, type, doc) {
  return {
    id: id,
    type: type,
    doc: doc,
    body: {
      messages: err.response.body,
      url: err.response.req.url
    },
    status: err.status,
    statusText: err.message
  }
}

module.exports = {
  handleGenericServerError: function (err) {
    var error = buildError(err, 'error-' + cuid(), 'error')
    logger.error('error in request: ', err)
    logger.info('stored error: ', error)
    return error
  },

  handleValidationServerError: function (obj, err) {
    var error = buildError(err, 'error-' + obj.doc.Id, 'validation', obj.doc)
    logger.error('conflict error: ', err)
    logger.info('stored error: ', error)
    return error
  },

  handlePushNewError: function (obj, err) {
    var error = buildError(err, 'error-' + obj.doc.Id, 'error', obj.doc)
    logger.error('failed to push new object: ', err)
    logger.info('stored error: ', error)
    return error
  },

  storeErrors: function (errors) {
    var allErrors = errors.concat(localErrors)
    localErrors = []
    logger.info('saving errors to PouchDb', allErrors)
    return Promise.all(allErrors.map(function (error) {
      return getDb().upsert(error.id, function (doc) {
        return _.extend(doc, error)
      })
    }))
  },

  addError: function (error) {
    localErrors.push(error)
  }
}
