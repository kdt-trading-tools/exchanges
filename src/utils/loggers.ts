import type { Logger } from '../types'

export const consoleLogger: Logger = console

export const silentLogger: Logger = {
    debug: () => void 0,
    trace: () => void 0,
    warn: () => void 0,
}
