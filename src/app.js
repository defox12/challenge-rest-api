import Koa from 'koa'
import Router from 'koa-router'
import bodyParser from 'koa-bodyparser'
import pg from 'pg'
import Pricing from './pricing.js'
import Machine from './machine.js'
import path from 'path'
import fs from 'fs'

const app = new Koa()
const router = new Router()
const dbpool = new pg.Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'postgres',
  password: 'mysecretpassword',
  port: 5432,
})
const defaultPrices = JSON.parse(fs.readFileSync(path.join('.', 'prices.json'), 'utf8')).default_pricing;
const pricingService = new Pricing(dbpool, defaultPrices);
const machineService = new Machine(dbpool);

dbpool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err)
  process.exit(-1)
})

app.install = () => {
  return pricingService.install()
    .then(() => machineService.install())
}

router
  .use(bodyParser())
  .get('/', (ctx, next) => {
    ctx.body = 'hello world'
  })
  .get('/pricing-models', (ctx, next) => {
    return pricingService.get()
      .then(result => {
        ctx.body = result
      })
  })
  .post('/pricing-models', (ctx, next) => {
    const name = ctx.request.body ? ctx.request.body.name : null;
    return pricingService.create(name)
      .then(result => {
        ctx.body = {id: result}
      })
      .catch(err => {
        if (err === 'pricemodel_name_required' || err === 'pricemodel_existed') {
          ctx.status = 400
          ctx.body = {error: err}
        }
      })
  })
  .get('/pricing-models/:pmid', (ctx, next) => {
    return pricingService.getByID(ctx.params.pmid)
      .then(result => {
        ctx.body = result
      })
      .catch(err => {
        if (err === 'pricemodel_id_required') {
          ctx.status = 400
          ctx.body = {error: err}
        }
      })
  })
  .put('/pricing-models/:pmid', (ctx, next) => {
    const name = ctx.request.body ? ctx.request.body.name : null
    return pricingService.update({id: ctx.params.pmid, name})
      .then(result => {
        ctx.body = {id: result}
      })
      .catch(err => {
        if (err === 'pricemodel_name_id_required' || err === 'pricemodel_existed') {
          ctx.status = 400
          ctx.body = {error: err}
        }
      })
  })
  .get('/pricing-models/:pmid/prices', (ctx, next) => {
    return pricingService.getPrices(ctx.params.pmid)
      .then(result => {
        ctx.body = result
      })
      .catch(err => {
        if (err === 'pricemodel_id_required') {
          ctx.status = 400
          ctx.body = {error: err}
        }
      })
  })
  .post('/pricing-models/:pmid/prices', (ctx, next) => {
    return pricingService.addPrice(ctx.params.pmid, ctx.request.body)
      .then(result => {
        ctx.body = {id: result}
      })
      .catch(err => {
        if (err === 'pricemodel_id_required' || err === 'price_name_required' || err === 'price_existed') {
          ctx.status = 400
          ctx.body = {error: err}
        }
      })
  })
  .delete('/pricing-models/:pmid/prices/:priceid', (ctx, next) => {
    return pricingService.removePrice(ctx.params.pmid, ctx.params.priceid)
      .then(result => {
        if (result) {
          ctx.status = 200
        }
      })
      .catch(err => {
        if (err === 'price_id_pricemodel_id_required') {
          ctx.status = 400
          ctx.body = {error: err}
        }
      })
  })
  .put('/machines/:machineid/prices/:pmid', (ctx, next) => {
    return pricingService.getByID(ctx.params.pmid).then(price => {
      return machineService.setPrice(ctx.params.machineid, price.id)
        .then(result => {
          if (result) {
            ctx.body = {id: result}
          }
        })
    }).catch(err => {
      if (err === 'machine_id_pricemodel_id_required') {
        ctx.status = 400
        ctx.body = {error: err}
      }
    })
  })
  .delete('/machines/:machineid/prices', (ctx, next) => {
    return machineService.removePrice(ctx.params.machineid)
      .then(result => {
        if (result) {
          ctx.status = 200
        }
      })
      .catch(err => {
        if (err === 'machine_id_required') {
          ctx.status = 400
          ctx.body = {error: err}
        }
      })
  })
  .get('/machines/:machineid/prices', (ctx, next) => {
    return machineService.getByID(ctx.params.machineid).then(machine => {
      if (machine && machine.pricing_id) {
        return pricingService.getByID(machine.pricing_id)
          .then(prices => {
            ctx.body = prices
          })
      } else {
        ctx.body = defaultPrices.slice()
      }
    }).catch(() => {})
  })

app.use(router.routes())

export default app
