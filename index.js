#!/usr/bin/env node

import * as tar from 'tar'
import express from 'express'
import cors from 'cors'
import * as path from 'node:path'
import ngrok from 'ngrok'
import { status } from '@polioan/http-status'
import * as fs from 'node:fs/promises'

const logger = Object.freeze({
  info(message, ...metadata) {
    console.info('INFO', message, ...metadata)
  },
  warn(message, ...metadata) {
    console.warn('WARN', message, ...metadata)
  },
  error(message, ...metadata) {
    console.error('ERROR', message, ...metadata)
  },
  fatal(message, ...metadata) {
    console.error('FATAL', message, ...metadata)
    process.exit(1)
  },
})

process.on('uncaughtException', error => {
  logger.fatal('Uncaught exception', error)
})

const [action, ...argv] = process.argv.filter(Boolean).slice(2)

const CWD = process.cwd()

const PORT = 12345

const HOST = '0.0.0.0'

const actions = Object.freeze({
  async transmit() {
    const [name] = argv
    if (name) {
      const expressApp = express()

      expressApp.disable('x-powered-by')

      expressApp.use(cors({}))

      const archiveName = `${name}.tgz`
      const fullName = path.join(CWD, archiveName)

      expressApp.get('/', (_req, res) => {
        logger.info('Request to file')
        res.status(status.OK).download(fullName, archiveName, error => {
          if (error) {
            logger.error('Error sending file', error)
            res.status(status.INTERNAL_SERVER_ERROR).json({})
          }
        })
      })

      await new Promise(resolve => {
        expressApp.listen(PORT, HOST, () => {
          resolve(null)
        })
      })

      logger.info(`Express server started on port ${PORT}`)

      const url = await ngrok.connect(PORT)

      logger.info(`Ngrok tunnel started on ${url}`)
    } else {
      logger.fatal('Missing file name')
    }
  },
  async receive() {
    const [url] = argv
    if (url) {
      const response = await fetch(url)

      if (response.status !== status.OK) {
        logger.fatal('Invalid response status', response.status)
      }

      const contentDisposition = response.headers.get('Content-Disposition')

      if (contentDisposition) {
        const name = contentDisposition
          .split(';')
          .map(p => {
            return p.trim()
          })
          .find(p => {
            return p.toLowerCase().startsWith('filename=')
          })
          ?.replace('filename=', '')
          .slice(1, -1)
        if (name) {
          const fullName = path.join(CWD, name)
          const buffer = await response.arrayBuffer()
          await fs.writeFile(fullName, Buffer.from(buffer))
        } else {
          logger.fatal('Invalid Content-Disposition header')
        }
      } else {
        logger.fatal('Missing Content-Disposition header')
      }
    } else {
      logger.fatal('Missing url')
    }
  },
  async archive() {
    const [name] = argv
    if (name) {
      await tar.create(
        {
          gzip: false,
          sync: false,
          file: `${name}.tgz`,
          cwd: CWD,
        },
        [name]
      )
    } else {
      logger.fatal('Missing archive name')
    }
  },
  async unarchive() {
    const [name] = argv
    if (name) {
      await tar.extract({
        gzip: false,
        sync: false,
        file: `${name}.tgz`,
        cwd: CWD,
      })
    } else {
      logger.fatal('Missing archive name')
    }
  },
})

const actionsNames = Object.keys(actions)

if (typeof action === 'undefined' || !actionsNames.includes(action)) {
  logger.fatal(
    `Invalid action "${action ?? ''}", use one of: ${actionsNames.join(', ')}`
  )
} else {
  await actions[action]()
}
