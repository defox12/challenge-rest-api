import request from 'supertest'
import app from './app.js'
import pg from 'pg'

const dbpool = new pg.Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'postgres',
  password: 'mysecretpassword',
  port: 5432,
})

function reset() {
  return new Promise((resolve, reject) => {
    return dbpool.connect().then(client => {
      const dmls = [
        client.query('drop table pricingmodels'),
        client.query('drop table prices'),
        client.query('drop table machines')
      ]

      return dmls.reduce((chain, table) => {
        return chain.then(() => {
          return new Promise((resolve2, reject2) => {
            table
              .then(res => {
                resolve2(res)
              })
              .catch(err => {
                if (err.message.includes(' does not exist')) {
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
          return resolve(res)
        })
        .catch(err => {
          client.release()
        })
    })
  })
}

beforeAll(async (done) => {
  return reset().then(resreset => {
    return app.install().then(response => {
      done()
      return {response, resreset}
    })
  })
})

let newPMId, newPriceId
describe('GET /pricing-models', () => {
  const http = request(app.callback()).get('/pricing-models')
  test('returns all of the pricing models available for the system', async (done) => {
    const response = await http
    expect(response.status).toBe(200)
    expect(Object.keys(response.body).length).toBe(1)
    done()
  })

  test('also returns the default pricing model in prices.json', async (done) => {
    const response = await http
    expect(response.status).toBe(200)
    expect(response.body.default_pricing).toBeTruthy()
    done()
  })
})

describe('POST /pricing-models', () => {
  let response
  test('creates a new pricing model in the system', async (done) => {
    response = await request(app.callback()).post('/pricing-models').send({name: 'test'})
    expect(response.status).toBe(200)
    done()
  })

  test('returns the ID of the new pricing model to the caller', async (done) => {
    expect(response.status).toBe(200)
    expect(response.body.id.length).toBe(36)
    newPMId = response.body.id
    done()
  })
})

describe('GET /pricing-models/:pm-id', () => {
  let response
  test('get an individual pricing model', async (done) => {
    response = await request(app.callback()).get('/pricing-models/' + newPMId)
    expect(response.status).toBe(200)
    expect(typeof response.body).toBe('object')
    done()
  })

  test('include the price configurations for the pricing model', async (done) => {
    expect(response.status).toBe(200)
    expect(response.body.pricing.length).toBe(0)
    done()
  })

  test('if the pricing model isn\'t found by pm-id it responds with not found', async (done) => {
    const response = await request(app.callback()).get('/pricing-models/notfound')
    expect(response.status).toBe(404)
    done()
  })
})

describe('PUT /pricing-models/:pm-id', () => {
  const newName = 'Super Value Option'
  let response, response2

  test('updates an existing pricing model meta-data', async (done) => {
    response = await request(app.callback()).put('/pricing-models/' + newPMId).send({name: newName})
    response2 = await request(app.callback()).get('/pricing-models/' + newPMId)
    expect(response.status).toBe(200)
    expect(response.body.id).toBe(newPMId)
    expect(response2.status).toBe(200)
    expect(response2.body.name).toBe(newName)
    done()
  })

  test('does not affect the pricing configurations for the pricing model', async (done) => {
    expect(response.status).toBe(200)
    expect(response2.status).toBe(200)
    expect(response2.body.pricing.length).toBe(0)
    done()
  })
})

describe('GET /pricing-models/:pm-id/prices', () => {
  test('returns the prices configured for a specific pricing model', async (done) => {
    const response = await request(app.callback()).get('/pricing-models/' + newPMId + '/prices')
    expect(response.status).toBe(200)
    expect(response.body.length).toBe(0)
    done()
  })
})

describe('POST /pricing-models/:pm-id/prices', () => {
  test('adds a new price configuration for a pricing model', async (done) => {
    const response = await request(app.callback()).post('/pricing-models/' + newPMId + '/prices').send({price: 3, name: '10 Minutes', value: 10})
    expect(response.status).toBe(200)
    expect(response.body.id.length).toBe(36)
    newPriceId = response.body.id
    done()
  })
})

describe('DELETE /pricing-models/:pm-id/prices/:price-id', () => {
  let response
  test('removes a price configuration from a pricing model', async (done) => {
    const response = await request(app.callback()).delete('/pricing-models/' + newPMId + '/prices/' + newPriceId)
    expect(response.status).toBe(200)
    done()
  })

  test('if the pricing model isn\'t found by pm-id it responds with not found', async (done) => {
    response = await request(app.callback()).get('/pricing-models/notfound/prices/' + newPriceId)
    expect(response.status).toBe(404)
    done()
  })

  test('if the price configuration isn\'t found by price-id it responds with not found', async (done) => {
    response = await request(app.callback()).get('/pricing-models/' + newPMId + '/prices/' + newPriceId)
    expect(response.status).toBe(404)
    done()
  })
})

const machineId = '99ade105-dee1-49eb-8ac4-e4d272f89fba'
describe('PUT /machines/:machine-id/prices/:pm-id', () => {
  beforeAll(async (done) => {
    const response = await request(app.callback()).post('/pricing-models/' + newPMId + '/prices').send({price: 3, name: '10 Minutes', value: 10})
    const response2 = await request(app.callback()).post('/pricing-models/' + newPMId + '/prices').send({price: 5, name: '20 Minutes', value: 20})
    done()
    return {response, response2}
  })

  test('sets the pricing model for an individual machine to the one from pm-id', async (done) => {
    const response = await request(app.callback()).put('/machines/' + machineId + '/prices/' + newPMId)
    const response2 = await request(app.callback()).get('/machines/' + machineId + '/prices')
    expect(response.status).toBe(200)
    expect(response.body.id).toBe(machineId)
    expect(response2.status).toBe(200)
    expect(response2.body.id).toBe(newPMId)
    done()
  })

  test('if the machine already has a pricing model, it is replaced by this one', async (done) => {
    const response = await request(app.callback()).put('/machines/' + machineId + '/prices/' + newPMId)
    const response2 = await request(app.callback()).get('/machines/' + machineId + '/prices')
    expect(response.status).toBe(200)
    expect(response.body.id).toBe(machineId)
    expect(response2.status).toBe(200)
    expect(response2.body.id).toBe(newPMId)
    done()
  })

  test('if the machine isn\'t found by machine-id it responds with not found', async (done) => {
    const response = await request(app.callback()).put('/machines/notfound/prices/' + newPMId)
    expect(response.status).toBe(404)
    done()
  })

  test('if the pricing model isn\'t found by pm-id it responds with not found', async (done) => {
    const response = await request(app.callback()).put('/machines/' + machineId + '/prices/notfound')
    expect(response.status).toBe(404)
    done()
  })
})

describe('DELETE /machines/:machine-id/prices', () => {
  test('removes the pricing model from the machine (unsets it)', async (done) => {
    const response = await request(app.callback()).delete('/machines/' + machineId + '/prices')
    const response2 = await request(app.callback()).get('/machines/' + machineId + '/prices')
    expect(response.status).toBe(200)
    expect(response2.status).toBe(200)
    expect(response2.body.pricing_id).toBe(undefined)
    done()
  })
})

describe('GET /machines/:machine-id/prices', () => {
  test('return the pricing model and price configurations set for a given machine', async (done) => {
    const response = await request(app.callback()).get('/machines/' + machineId + '/prices')
    expect(response.status).toBe(200)
    expect(response.body.id).toBe(undefined)
    done()
  })

  // if the machine does not have a pricing model configured then the default model from prices.json is returned
  test('if the machine isn\'t found by machine-id it responds with not found', async (done) => {
    const response = await request(app.callback()).get('/machines/notfound/prices')
    expect(response.status).toBe(404)
    done()
  })
})
