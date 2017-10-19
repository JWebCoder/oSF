// @flow

import errors from 'errors'
import axios from 'axios'

import type {SFConfig, RequestObject, AxiosError, AxiosResponse, User, AxiosErrorResponse} from 'types'

export default class SFapi {
  options: SFConfig
  constructor (options: SFConfig) {
    this.options = options
  }

  request (obj: RequestObject): Promise<any> {
    return new Promise(
      (resolve, reject) => {
        this.options.auth.isLoggedIn()
          ? resolve(this.options.auth.getUser())
          : reject(new Error('No access token. Login and try again.'))
      }
    ).then(
      (user: User | void): Promise<any> => {
        if (user) {
          const method: string = obj.method ? obj.method.toLowerCase() : 'get'
          const headers: Headers = new Headers({
            ...this.options.headers,
            'Content-Type': obj.contentType || 'application/json',
            'Authorization': 'Bearer ' + user.access_token
          })

          if (this.options.proxyUrl) {
            headers.append('target-base-url', this.options.baseUrl || user.instance_url)
          }

          const baseUrl = this.options.proxyUrl || this.options.baseUrl || user.instance_url

          // dev friendly API: Add leading '/' if missing so url + path concat always works
          if (obj.path.charAt(0) !== '/') {
            obj.path = `/${obj.path}`
          }

          let query: string = ''

          if (obj.params) {
            query = '?' + Object.keys(obj.params)
              .map(
                (k: string) => `${encodeURIComponent(k)}=${encodeURIComponent(obj.params ? obj.params[k]: '')}`
              )
              .join('&')
          }

          return axios({
            method,
            headers,
            url: baseUrl + obj.path + query,
            data: obj.data
          })
        } else {
          throw new Error('Not logged in')
        }
      }
    ).then(
      (response: AxiosResponse): {} => {
        return response.data
      }
    ).catch(
      (error: AxiosError) => {
        if (error.response) {
          let err: AxiosErrorResponse = error.response
          // The request was made and the server responded with a status code
          // that falls out of the range of 2xx
          console.log(err.data)
          console.log(err.status)
          console.log(err.headers)
        } else if (error.request) {
          // The request was made but no response was received
          // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
          // http.ClientRequest in node.js
          console.log(error.request)
        } else {
          // Something happened in setting up the request that triggered an Error
          console.log('Error', error.message)
        }
        console.log(error.config)
        errors.addError(errors.handleGenericServerError(error))
        throw error
      }
    )
  }

  query (soql: string) {
    return this.request({
      path: this.options.routes.query,
      params: {
        q: soql
      }
    }).catch(
      (err: AxiosError) => {
        throw err
      }
    )
  }

  removeforbiddenFields (data: {'@@FW_META@@': {fieldsNotToPush: []}}): {} {
    const fieldsNotToPush: string[] = ['_id', 'id', '_rev', 'rev', 'Id', '@@FW_META@@', 'type', 'LastModifiedDate', 'LastReferencedDate', 'LastViewedDate', 'SystemModstamp']
    const meta: [] = data['@@FW_META@@'].fieldsNotToPush || []
    const toBePushed: {} = fieldsNotToPush.concat(meta).reduce(
      (current: {[string]: *}, forbiddenField: string) => {
        delete current[forbiddenField]
        return current
      }, {...data}
    )
    return toBePushed
  }

  create (objectName: string, data: {'@@FW_META@@': {fieldsNotToPush: []}}): Promise<any> {
    var fields: {} = this.removeforbiddenFields(data)

    return this.request({
      method: 'post',
      contentType: 'application/json',
      path: this.options.routes.create + objectName + '/',
      params: {
        '_HttpMethod': 'POST'
      },
      data: fields
    }).catch(
      (err: AxiosError) => {
        throw err
      }
    )
  }

  update (objectName: string, id: string, data: {'@@FW_META@@': {fieldsNotToPush: []}}): Promise<any> {
    var fields: {} = this.removeforbiddenFields(data)
    var reqConfig: RequestObject = {
      method: 'patch',
      contentType: 'application/json',
      path: this.options.routes.update + objectName + '/' + id,
      data: fields
    }
    return this.request(reqConfig).catch(
      (err: AxiosError) => {
        throw err
      }
    )
  }

  deleteRecord (objectName: string, id: string): Promise<any> {
    var reqConfig: RequestObject = {
      method: 'delete',
      contentType: 'application/json',
      path: this.options.routes.delete + objectName + '/' + id,
      params: {
        '_HttpMethod': 'DELETE'
      }
    }
    return this.request(reqConfig).catch(
      (err: AxiosError) => {
        throw err
      }
    )
  }

  get (obj: RequestObject): Promise<any> {
    return this.request(obj).catch(
      (err: AxiosError) => {
        throw err
      }
    )
  }

  post (obj: RequestObject): Promise<any> {
    obj.method = 'POST'
    return this.request(obj).catch(
      (err: AxiosError) => {
        throw err
      }
    )
  }
}
