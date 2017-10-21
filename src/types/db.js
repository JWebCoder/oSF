// @flow

export type DBParams = {
  searchIndex: string,
  query?: string,
  limit?: number,
  docType?: string
}

export type DBQuery = {
  include_docs?: boolean,
  attachments?: boolean,
  limit?: number,
  startkey: string,
  endkey: string
}

export type Original = {
  Id: string,
  type: string,
  [string]: {}
}

export type Override = {
  Id: string,
  type: string,
  '@@FW_META@@'?: {}
}

export type DBItem = {
  _id: string,
  id: string,
  _rev: string,
  doc?: {},
  config?: {},
  lastSyncDate?: string,
  '@@FW_META@@'?: {},
  remote?: {
    Id: string,
    type: string
  },
  original?: Original
}

export type DBResponse = {
  offset: number,
  rows: DBItem[],
  total_rows: number
}

export type DBFile = {
  fileName: string,
  contentType: string,
  data: string,
  SFEntityId: string
}

export type DBAttachment = {
  [string]: {
    content_type: string,
    data: string
  }
}
