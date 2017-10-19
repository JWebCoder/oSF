// @flow

export function mergeFrameworkMetadataObject (initialValue: {} = {}, params: {} = {}): {} {
  const base = {
    lastModifiedDate: new Date().toISOString()
  }

  return {
    ...initialValue,
    ...base,
    ...params
  }
}

export default {
  mergeFrameworkMetadataObject
}
