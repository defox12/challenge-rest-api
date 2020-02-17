import uuid from 'uuid/v4.js'
import BaseModel from './base-model.js'

export default class Pricing extends BaseModel {
  constructor(dbpool, defaultPrices) {
    super(dbpool)
    this.defaultPrices = defaultPrices
  }

  install() {
    return this.checkPool().then(() => {
      return this.dbpool.connect().then(client => {
        const dmls = [
          client.query('create table ' + Pricing.modelTableName + ' (id uuid primary key, name varchar(255))'),
          client.query('create table ' + Pricing.pricesTableName + ' (id uuid primary key, model_id uuid, price int, name varchar(255), value int, constraint un_' + Pricing.pricesTableName +' unique(model_id, name))')
        ]

        return dmls.reduce((chain, table) => {
          return chain.then(() => {
            return new Promise((resolve2, reject2) => {
              table
                .then(res => {
                  resolve2(res)
                })
                .catch(err => {
                  if (err.message.includes('already exists')) {
                    resolve2(err)
                  } else {
                    throw err
                  }
                })
            })
          })
        }, Promise.resolve())
          .then(res => {
            client.release()
            return res
          }).catch(err => this.queryErrorHandler(err, client))
      })
    })
  }

  get() {
    return this.checkPool().then(() => {
      return this.dbpool.connect().then(client => {
        return client.query('SELECT * FROM ' + Pricing.modelTableName, []).then(res => {
          const result = {default_pricing: this.defaultPrices}
          if (res.rows && res.rows.length > 0) {
            return res.rows.reduce((chain, model) => {
              return chain.then(() => {
                return this.getPrices(model.id, client).then(pricing => {
                  result[model.id] = {id: model.id, name: model.name, pricing: pricing}
                })
              })
            }, Promise.resolve()).then(() => {
              client.release()
              return result
            })
          } else {
            client.release()
            return Promise.resolve(result)
          }
        }).catch(err => this.queryErrorHandler(err, client))
      })
    })
  }

  create(name) {
    return this.checkPool().then(() => {
      if (name) {
        return this.dbpool.connect().then(client => {
          let q = 'select * from ' + Pricing.modelTableName + ' where name=$1'
          let p = [name]
          return client.query(q, p).then(resexisted => {
            if (resexisted.rows && resexisted.rows.length > 0) return Promise.reject('pricemodel_existed')

            const id = uuid()
            q = 'insert into ' + Pricing.modelTableName + ' (id, name) values ($1, $2)'
            p = [id, name]
            return client.query(q, p).then(res => {
              client.release()
              return id
            })
          }).catch(err => this.queryErrorHandler(err, client))
        })
      } else {
        return Promise.reject('pricemodel_name_required')
      }
    })
  }

  update(data) {
    return this.checkPool().then(() => {
      if (data.id && data.name) {
        return this.dbpool.connect().then(client => {
          let q = 'select * from ' + Pricing.modelTableName + ' where name=$1'
          let p = [data.name]
          return client.query(q, p).then(resexisted => {
            if (resexisted.rows && resexisted.rows.length > 0) return Promise.reject('pricemodel_existed')

            q = 'update ' + Pricing.modelTableName + ' set name=$1 where id=$2'
            p = [data.name, data.id]
            return client.query(q, p).then(res => {
              client.release()
              return data.id
            })
          }).catch(err => this.queryErrorHandler(err, client))
        })
      } else {
        return Promise.reject('pricemodel_name_id_required')
      }
    })
  }

  getByID(id) {
    return this.checkPool().then(() => {
      if (id) {
        return this.dbpool.connect().then(client => {
          let q = 'select * from ' + Pricing.modelTableName + ' where id=$1'
          let p = [id]
          return client.query(q, p).then(res => {
            if (!(res.rows && res.rows.length > 0)) return Promise.reject('not_found')

            const record = res.rows[0]
            return this.getPrices(id, client).then(pricing => {
              client.release()
              record.pricing = pricing
              return record
            })
          }).catch(err => this.queryErrorHandler(err, client))
        })
      } else {
        return Promise.reject('pricemodel_id_required')
      }
    })
  }

  getPrices(id, client) {
    if (id) {
      let clientResolver
      let isManagingOwnConnection = false
      if (client) {
        clientResolver = Promise.resolve(client)
      } else {
        clientResolver = this.dbpool.connect()
        isManagingOwnConnection = true
      }
      return clientResolver.then(client2 => {
        return client2.query('select id, price, name, value from ' + Pricing.pricesTableName + ' where model_id=$1', [id]).then(res => {
          if (isManagingOwnConnection) client2.release()
          let pricing = []
          if (res.rows && res.rows.length > 0) {
            pricing = res.rows
          }
          return pricing
        })
      })
    } else {
      return Promise.reject('pricemodel_id_required')
    }
  }

  addPrice(pmid, data) {
    return this.checkPool().then(() => {
      if (!pmid) return Promise.reject('pricemodel_id_required')
      if (!data.name) return Promise.reject('price_name_required')

      return this.dbpool.connect().then(client => {
        let q = 'select * from ' + Pricing.pricesTableName + ' where model_id=$1 and name=$2'
        let p = [pmid, data.name]
        return client.query(q, p).then(resexisted => {
          if (resexisted.rows && resexisted.rows.length > 0) return Promise.reject('price_existed')

          const id = uuid()
          q = 'insert into ' + Pricing.pricesTableName + ' (id, model_id, price, name, value) values ($1, $2, $3, $4, $5)'
          p = [id, pmid, data.price ? data.price : 0, data.name, data.value ? data.value : 0]
          return client.query(q, p).then(res => {
            client.release()
            return id
          })
        }).catch(err => this.queryErrorHandler(err, client))
      })
    })
  }

  removePrice(pmid, priceid) {
    return this.checkPool().then(() => {
      if (!pmid) return Promise.reject('pricemodel_id_required')
      if (!priceid) return Promise.reject('price_id_required')

      return this.dbpool.connect().then(client => {
        let q = 'delete from ' + Pricing.pricesTableName + ' where model_id=$1 and id=$2'
        let p = [pmid, priceid]
        return client.query(q, p).then(res => {
          client.release()
          if (res.rowCount !== 0) return true
          return false
        }).catch(err => this.queryErrorHandler(err, client))
      })
    })
  }
}
Pricing.modelTableName = 'pricingmodels'
Pricing.pricesTableName = 'prices'
