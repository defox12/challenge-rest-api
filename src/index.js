import app from './app.js'

const PORT = process.env.PORT || 1337

app.install().then(res => {
  app.listen(PORT, () =>
    console.log(`Server listening on port ${PORT}`)
  )
})
