/* global localStorage */
// @flow

import type SFapi from 'sf/api'

let api: SFapi

function getLangFromSF (username: string): Promise<any> {
  return api.query("SELECT LanguageLocaleKey FROM User WHERE Username =  '" + username + "'")
}

function getLocaleFromSF (username: string): Promise<any> {
  return api.query("SELECT LocaleSidKey FROM User WHERE Username =  '" + username + "'")
}

function getCurrencyFromSF (username: string): Promise<any> {
  return api.query("SELECT DefaultCurrencyIsoCode FROM User WHERE Username =  '" + username + "'")
}

function getLang (): string {
  return localStorage.getItem('Lang') || ''
}

function storeLang (res: string): void {
  localStorage.setItem('Lang', res)
}

function getLocale (): string {
  return localStorage.getItem('Locale') || ''
}

function storeLocale (res: string): void {
  localStorage.setItem('Locale', res)
}

function getCurrency (): string {
  return localStorage.getItem('Currency') || ''
}

function storeCurrency (res: string): void {
  localStorage.setItem('Currency', res)
}

export type LangAdapter = {
  getLangFromSF: (username: string) => Promise<any>,
  getLocaleFromSF: getLocaleFromSF,
  getCurrencyFromSF: getCurrencyFromSF,
  getLang: getLang,
  storeLang: storeLang,
  getLocale: getLocale,
  storeLocale: storeLocale,
  getCurrency: getCurrency,
  storeCurrency: storeCurrency
}

export default function langAdapter (service: SFapi): LangAdapter {
  api = service

  return {
    getLangFromSF: getLangFromSF,
    getLocaleFromSF: getLocaleFromSF,
    getCurrencyFromSF: getCurrencyFromSF,
    getLang: getLang,
    storeLang: storeLang,
    getLocale: getLocale,
    storeLocale: storeLocale,
    getCurrency: getCurrency,
    storeCurrency: storeCurrency
  }
}
