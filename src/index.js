// @flow

import routes from 'sf/routes'
import SFapi from 'sf/api'
import Auth from 'sf/auth'
import db from 'db'
import dbDriver from 'DBDriver'

import type {Config, Routes, AuthAdapter} from 'types'

var sync = require('./sync')

var langAdapter = require('./langAdapter')
var pkg = require('../package.json')
var _ = require('lodash')
var redux = require('redux')
var actions = require('./redux/actions')
var reducer = require('./redux/reducer')
var store = redux.createStore(reducer)

export function create (config: Config) {
  const routesConfig: Routes = config.routes ? config.routes : routes(config)

  const auth: AuthAdapter = config.authAdapter
    ? config.authAdapter(config, routesConfig.loginUrl)
    : new Auth(config, routesConfig.loginUrl)

  const sfApi: SFapi = new SFapi({
    auth: auth,
    routes: _.extend({}, routesConfig, config.routes || {}),
    baseUrl: config.baseUrl,
    proxyUrl: config.proxyUrl || '',
    headers: auth.headers
  })
  const lang = langAdapter(sfApi)

  const options = {
    api: {
      sf: sfApi
    },
    localApi: dbDriver,
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
    search: dbDriver.search,
    query: dbDriver.query,
    allDocs: dbDriver.allDocs,
    bulkDocs: dbDriver.bulkDocs,
    getById: dbDriver.getById,
    create: dbDriver.create,
    createAttachment: dbDriver.createAttachment,
    update: dbDriver.update,
    getSyncErrors: dbDriver.getSyncErrors,
    removeSyncErrors: dbDriver.removeSyncErrors,
    keepLocal: dbDriver.keepLocal,
    keepRemote: dbDriver.keepRemote,
    remove: dbDriver.remove,
    upsert: dbDriver.upsert,
    putIfNotExists: dbDriver.putIfNotExists,
    wipeDb: dbDriver.wipeDb,
    delete: dbDriver.deleteLocalObject,
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
