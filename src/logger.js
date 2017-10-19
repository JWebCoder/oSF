// @flow

const isDev: boolean = process.env.NODE_ENV !== 'production'

const types = ['group', 'groupEnd', 'log', 'error', 'info']

types.forEach(
  (method) => {
    module.exports[method] = function (...any: any): void {
      if (isDev) {
        console[method].apply(console, any)
      }
    }
  }
)
