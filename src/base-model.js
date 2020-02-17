export default class BaseModel {
  constructor(dbpool) {
    this.dbpool = dbpool
  }

  checkPool() {
    if (this.dbpool) {
      return Promise.resolve(this.dbpool)
    } else {
      return Promise.reject(new Error('invalid_dbpool'))
    }
  }

  queryErrorHandler(err, client) {
    if (client) {
      client.release()
    }
    if (err && err.message && !err.message.includes('invalid input syntax for type uuid')) {
      console.error(err)
    }
    throw err
  }
}
