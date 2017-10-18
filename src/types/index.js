// @flow

export type User = {
  access_token: string,
  instance_url: string
}

export type Auth = {
  getUser: () => User,
  isLoggedIn: () => {},
  logout: () => {},
  login: () => {},
  storeUser: () => {},
  headers: () => {}
}

export type Config = {
  timeout: number,
  remoteConfigObject: string,
  clientId: string,
  clientSecret: string,
  baseLoginUrl: string,
  SFAPIVersion: string,
  proxyUrl?: string,
  authAdapter?: (config: Config, loginUrl: string) => mixed
}

export type SFConfig = {
  auth: Auth,
  routes: Routes,
  baseUrl: string,
  proxyUrl: string,
  headers: {}
}

export type Routes = {
  query: string,
  create: string,
  attachment: string,
  update: string,
  delete: string,
  validationRules: string,
  layouts: string,
  genericObjects: string,
  layout: string,
  loginUrl: string,
  syncConfigPath: string
}

export type RequestObject = {
  method?: string,
  path: string,
  params?: {},
  data?: {},
  contentType?: string
}

export type AxiosResponse = {
  data: {},
  status: number,
  statusText: string,
  headers: {},
  config: {},
  request: {}
}

export type AxiosErrorResponse = {
  data: string,
  status: string,
  headers: string
}

export type AxiosError = {
  response?: AxiosErrorResponse,
  request?: string,
  message?: string,
  config: string
}

export type SFLoginParams = {
  client_id: string,
  client_secret: string,
  username: string,
  password: string,
  grant_type: 'password'
}
