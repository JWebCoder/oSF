// @flow

export function buildSelectObjectQuery (fields: string[], obj:{soql?:string, name: string}, lastSyncDate?: string, user?: {username: string}): string {
  var usingScopeToken = 'using scope'
  var soqlStatement = obj.soql ? obj.soql.trim().toLowerCase() : ''
  var query = 'select ' + fields.join(',') + ' from ' + obj.name
  query += obj.soql && soqlStatement.indexOf(usingScopeToken) === 0 ? ' ' + obj.soql + ' ' : ''
  if (query.toLowerCase().indexOf('where ') === -1) {
    // add where clause only if not present yet (It might be present in the SOQL statement)
    query += ' WHERE Id != null '
  }
  query += obj.soql && soqlStatement.indexOf(usingScopeToken) !== 0 ? ' and ' + obj.soql + ' ' : ''
  query += user && obj.name.trim().toLowerCase() === 'user' ? " and Username = '" + user.username + "' " : ''
  query += lastSyncDate ? ' and LastModifiedDate >= ' + lastSyncDate : ''
  query += ' order by LastModifiedDate asc'
  return query
}
