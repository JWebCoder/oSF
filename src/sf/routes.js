// @flow

import type {Config, Routes} from 'types'

export default function (config: Config): Routes {
  const path = `/services/data/${config.SFAPIVersion}`
  const objects = `${path}/sobjects`
  return {
    query: `${path}/query`,
    create: `${objects}/`,
    attachment: `${objects}/Attachment`,
    update: `${objects}/`,
    delete: `${objects}/`,
    validationRules: `${path}/tooling/query`,
    layouts: `${objects}/`,
    genericObjects: `${objects}/`,
    layout: '',
    loginUrl: config.proxyUrl ? config.proxyUrl + '/services/oauth2/token' : config.baseLoginUrl + '/services/oauth2/token',
    syncConfigPath: `${objects}/${config.remoteConfigObject}/describe/`
  }
}
