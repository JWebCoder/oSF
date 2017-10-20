/* global localStorage */
// @flow
import axios from 'axios'

import type {Config, SFLoginParams, AxiosError, AxiosErrorResponse, User, AuthAdapter} from 'types'
import type {$AxiosXHR} from 'axios'

export default class Auth implements AuthAdapter {
  headers: Headers
  config: Config
  loginUrl: string

  constructor (config: Config, loginUrl: string) {
    this.headers = new Headers({
      'Content-Type': 'application/x-www-form-urlencoded'
    })

    if (config.proxyUrl) {
      this.headers.append('target-base-url', config.baseLoginUrl)
    }

    this.config = config
    this.loginUrl = loginUrl
  }

  getUser (): User | void {
    const data: string = localStorage.getItem('auth') || ''
    return data ? JSON.parse(data) : undefined
  }

  isLoggedIn (): string {
    return localStorage.getItem('auth') || ''
  }

  logout (callback: () => mixed) {
    localStorage.removeItem('auth')
    if (callback) callback()
  }

  login (username: string, password: string): Promise<any> {
    const params: SFLoginParams = {
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      username: username,
      password: password,
      grant_type: 'password'
    }

    return axios({
      method: 'post',
      url: this.loginUrl,
      data: params,
      headers: this.headers
    }).then(
      (response: $AxiosXHR<SFLoginParams>): {} => {
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
        return error
      }
    )
  }

  storeUser (response: {data: {}}, cb?: () => mixed) {
    localStorage.setItem('auth', JSON.stringify(response.data))
    if (cb) cb()
  }
}
