import BaseModel from './base-model.js'

export default class Machine extends BaseModel {
  constructor(dbpool, defaultPricing) {
    super(dbpool)
    this.defaultPricing = defaultPricing
  }

  install() {
    return this.checkPool().then(() => {
      return this.dbpool.connect().then(client => {
        return new Promise((resolve, reject) => {
          client.query('create table ' + Machine.tableName + ' (id uuid primary key, name varchar(255), pricing_id uuid)').then(res => {

            const q = 'insert into machines (id, name) values ($1, $2)'
            const ids = ['99ade105-dee1-49eb-8ac4-e4d272f89fba', '4111947a-6c58-4977-90fa-2caaaef88648', '57342663-909c-4adf-9829-6dd1a3aa9143', '5632e1ec-46cb-4895-bc8b-a91644568cd5']

            const results = []
            for (let i=0; i<ids.length; i++) {
              const name = 'Machine ' + (i + 1)
              results.push(client.query(q, [ids[i], name]))
            }
            return Promise.all(results).then(res => {
              client.release()
              resolve(true)
            })
          }).catch(err => {
            if (err && err.message && err.message.includes('already exists')) {
              resolve(true)
            } else {
              this.queryErrorHandler(err, client)
            }
          })
        })
      })
    })
  }

  getByID(id) {
    return this.checkPool().then(() => {
      if (id) {
        return this.dbpool.connect().then(client => {
          let q = 'select * from ' + Machine.tableName + ' where id=$1'
          let p = [id]
          return client.query(q, p).then(res => {
            if (!(res.rows && res.rows.length > 0)) return Promise.reject('not_found')

            const record = res.rows[0]
            record.pricing_id = record.pricing_id ? record.pricing_id : ''
            return record
          }).catch(err => this.queryErrorHandler(err, client))
        })
      } else {
        return Promise.reject('machine_id_required')
      }
    })
  }

  setPrice(id, pmid) {
    return this.checkPool().then(() => {
      if (id && pmid) {
        return this.dbpool.connect().then(client => {
          const q = 'update ' + Machine.tableName + ' set pricing_id=$1 where id=$2'
          const p = [pmid, id]
          return client.query(q, p).then(res => {
            client.release()
            if (res.rowCount) {
              return id
            }
          }).catch(err => this.queryErrorHandler(err, client))
        })
      } else {
        return Promise.reject('machine_id_pricemodel_id_required')
      }
    })
  }

  removePrice(id) {
    return this.checkPool().then(() => {
      if (id) {
        return this.dbpool.connect().then(client => {
          const q = 'update ' + Machine.tableName + ' set pricing_id=null where id=$1 and pricing_id is not null'
          const p = [id]
          return client.query(q, p).then(res => {
            client.release()
            if (res.rowCount) {
              return id
            }
          }).catch(err => this.queryErrorHandler(err, client))
        })
      } else {
        return Promise.reject('machine_id_required')
      }
    })
  }
}
Machine.tableName = 'machines'
