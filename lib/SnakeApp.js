require('snake2-utils')
const NODE_ENV = process.env.NODE_ENV || 'development'
const path = require('path')
const fs = require('fs')
const SnakeController = require('./SnakeController')
class SnakeApp {
  static get SnakeController () {
    return SnakeController
  }
  constructor (options) {
    options = Object.assign({
      skipKoa: false,
      envPath: path.join(process.cwd(), 'config/env'),
      middlewaresPath: path.join(process.cwd(), 'app/middlewares'),
      controllersPath: path.join(process.cwd(), 'app/controllers')
    }, options)
    const frozenOptions = Object.freeze(options || {})
    Object.defineProperties(this, {
      'NODE_ENV': { "get": () => { return NODE_ENV } },
      'options': { "get": () => { return frozenOptions } },
      'PORT': { "get": () => { return this['options'].PORT || this['_envVars'] && this['_envVars']['PORT'] || 3000 } }
    })
    // 非console
    if (!options.skipKoa) {
      const Koa = require('koa')
      const koa = new Koa()
      Object.defineProperties(this, {
        '_koa': { "get": () => { return koa } }
      })
    }
    Object.defineProperties(global, {
      "application": { "get": () => { return this } }
    })
  }
  
  async use (module, ...args) {
    if (module.mountedOn) {
      return await module.mountedOn(this, ...args)
    } else {
      console.error(`module ${module} must define mountedOn method`)
    }
  }
  
  async register (options) {
    options = Object.assign({}, this.options, options)
    // Register Env
    const envPath = options['envPath']
    let envVars = require(envPath)
    Object.assign(envVars, envVars[this['NODE_ENV']])
    const frozenEnvVars = Object.freeze(envVars)
    Object.defineProperties(this, { '_envVars': { "get": () => { return frozenEnvVars } } })

    // 非console
    if (!options.skipKoa) {
      // load Koa about
      // middleware
      const middlewaresPath = options['middlewaresPath']
      this._registerMiddlewares(middlewaresPath)
      //  controllers/routers
      const Routers = require(options['controllersPath'])
      this._registerRouter(Routers)
    }
    return this
  }
  
  _registerMiddlewares (middlesPath) {
    fs.readdirSync(middlesPath).sort().forEach(file => {
      let fileItem = path.join(middlesPath, file)
      let stats = fs.lstatSync(fileItem)
      // 不是隐藏文件
      if (file.indexOf('.') !== 0) {
        if (stats.isFile()) {
          let middlewares = require(fileItem)
          if (typeof middlewares === 'function') {
            middlewares = [middlewares]
          }
          middlewares.forEach(middleware => {
            this._koa.use(middleware.bind(this))
          })
        } else if (stats.isDirectory()) {
          // 文件夹不是以_开头，认为是middleware文件夹
          if (file.indexOf('_') !== 0) {
            this._registerMiddlewares(fileItem)
          }
        }
      }
    })
  }
  
  _registerRouter (Routers) {
    Object.isObject(Routers) && Object.keys(Routers).forEach((key) => {
      if (Object.isClass(Routers[key])) {
        let router = new Routers[key]()
        if (router instanceof SnakeController) {
          this._koa.use(router.routes()).use(router.allowedMethods())
        }
      } else {
        this._registerRouter(Routers[key])
      }
    })
  }
  
  startKoa (port) {
    this._koa.listen(port || this['PORT'], () => {
      console.log(`app start at: http://localhost:${this['PORT']}`)
    })
  }
}
module.exports = SnakeApp