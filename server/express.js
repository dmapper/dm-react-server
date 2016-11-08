const _ = require('lodash')
const async = require('async')
const conf = require('nconf')
const express = require('express')
const expressSession = require('express-session')
const serveStatic = require('serve-static')
const compression = require('compression')
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')
const methodOverride = require('method-override')
const healthcheck = require('dm-healthcheck')
const connectMongo = require('connect-mongo')
const resourceManager = require('./resourceManager')
const defaultClientLayout = require('./defaultClientLayout')
const { match } = require('react-router')

// Optional derby-login

module.exports = (appRoutes, error, options, cb) => {
  let MongoStore = connectMongo(expressSession)
  let mongoUrl = conf.get('MONGO_URL')

  let sessionStore = new MongoStore({ url: mongoUrl })
  sessionStore.on('connected', () => {
    let session = expressSession({
      secret: conf.get('SESSION_SECRET'),
      store: sessionStore,
      cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 365 * 2
      },
      saveUninitialized: true,
      resave: false
    })

    let expressApp = express()

    // ----------------------------------------------------->    logs    <#
    options.ee.emit('logs', expressApp)

    expressApp
      .use(compression())
      .use(healthcheck())
      .use(serveStatic(options.publicPath))
      .use('/build/client', express.static(options.dirname + '/build/client'))
      .use(cookieParser())
      .use(bodyParser.json({ limit: options.bodyParserLimit }))
      .use(bodyParser.urlencoded({ extended: true, limit: options.bodyParserLimit }))
      .use(methodOverride())
      .use(session)

    // ----------------------------------------------------->    afterSession    <#
    options.ee.emit('afterSession', expressApp)

    // ----------------------------------------------------->    middleware    <#
    options.ee.emit('middleware', expressApp)

    // Server routes
    // ----------------------------------------------------->      routes      <#
    options.ee.emit('routes', expressApp)

    // Client Apps routes
    // Memoize getting the end-user <head> code
    let getHead = _.memoize(options.getHead || (() => ''))

    expressApp.use((req, res, next) => {
      matchAppRoutes(req.url, appRoutes, (err, { appName, redirectLocation, renderProps }) => {
        if (err) return next()
        if (redirectLocation) {
          return res.redirect(302, redirectLocation.pathname + redirectLocation.search)
        }
        if (!renderProps) return next()

        // If client route found, render the client-side app
        if (err) return next('500: ' + req.url + '. Error: ' + err)
        let html = defaultClientLayout({
          styles: process.env.NODE_ENV === 'production'
              ? resourceManager.getProductionStyles(appName) : '',
          head: getHead(appName),
          jsBundle: resourceManager.getResourcePath('bundle', appName)
        })
        res.status(200).send(html)
      })
    })

    expressApp
      .all('*', (req, res, next) => next('404: ' + req.url))
      .use(error)

    cb({
      expressApp: expressApp
    })
  })
}

function matchUrl (location, routes, cb) {
  match({ routes, location }, (err, redirectLocation, renderProps) => {
    if (err) return cb(err)
    cb(null, { redirectLocation, renderProps })
  })
}

function matchAppRoutes (location, appRoutes, cb) {
  let appNames = _.keys(appRoutes)
  let match = {}
  async.forEachSeries(appNames, (appName, cb) => {
    let routes = appRoutes[appName]
    matchUrl(location, routes, (err, { redirectLocation, renderProps }) => {
      if (err) console.error('Error parsing react routes', err)
      if (redirectLocation || renderProps) {
        match = { appName, redirectLocation, renderProps }
        cb(true)
      } else {
        cb()
      }
    })
  }, () => {
    cb(null, match)
  })
}
