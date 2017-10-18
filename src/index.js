import routes from 'sf/routes'
import SFAPI from 'sf/api'
import auth from 'sf/auth'
import db from 'db'

import type {Config, Routes} from 'types'

var sync = require('./sync')
var pouchDbDriver = require('./pouchDbDriver')

var langAdapter = require('./langAdapter')
var pkg = require('../package.json')
var _ = require('lodash')
var redux = require('redux')
var actions = require('./redux/actions')
var reducer = require('./redux/reducer')
var store = redux.createStore(reducer)

export function create (config: Config) {
  const routesConfig: Routes = config.routes ? config.routes : routes(config)

  const auth = config.authAdapter
    ? config.authAdapter(config, routesConfig.loginUrl)
    : auth(config, routesConfig.loginUrl)

  const sfApi: typeof SFAPI = new SFAPI({
    auth: auth,
    routes: _.extend({}, routesConfig, config.routes || {}),
    baseUrl: config.baseUrl,
    proxyUrl: config.proxyUrl,
    headers: auth.headers
  })
  const lang = langAdapter(sfApi)
  const localApi = pouchDbDriver()

  const options = {
    api: {
      sf: sfApi
    },
    localApi: localApi,
    remoteConfigObject: config.remoteConfigObject,
    routes: routes,
    auth: auth,
    store: store,
    actions: actions
  }

  // those are public objects
  const remoteApi = sync(options)

  // just exporting a public interface
  // leaving the rest as an impl-detail
  return {
    // Operations performed on the local DB
    search: localApi.search,
    query: localApi.query,
    allDocs: localApi.allDocs,
    bulkDocs: localApi.bulkDocs,
    getById: localApi.getById,
    create: localApi.create,
    createAttachment: localApi.createAttachment,
    update: localApi.update,
    getSyncErrors: localApi.getSyncErrors,
    removeSyncErrors: localApi.removeSyncErrors,
    keepLocal: localApi.keepLocal,
    keepRemote: localApi.keepRemote,
    remove: localApi.remove,
    upsert: localApi.upsert,
    putIfNotExists: localApi.putIfNotExists,
    wipeDb: localApi.wipeDb,
    delete: localApi.deleteLocalObject,
    // Synchronization
    sync: remoteApi.sync,
    addSyncStep: remoteApi.addSyncStep,
    getSyncMetadataObject: remoteApi.getSyncMetadataObject,
    // Authentication methods
    getUser: auth.getUser,
    isLoggedIn: auth.isLoggedIn,
    logout: auth.logout,
    login: auth.login,
    storeUser: auth.storeUser,
    // Locales methods
    getLangFromSF: lang.getLangFromSF,
    getLang: lang.getLang,
    storeLang: lang.storeLang,
    getLocaleFromSF: lang.getLocaleFromSF,
    getLocale: lang.getLocale,
    storeLocale: lang.storeLocale,
    getCurrencyFromSF: lang.getCurrencyFromSF,
    getCurrency: lang.getCurrency,
    storeCurrency: lang.storeCurrency,
    store: store,
    db,
    api: sfApi
  }
}

module.exports = {
  version: pkg.version,
  create: create
}
