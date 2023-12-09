import type { Logger } from '../types'

export const consoleLogger: Logger = { ...console, trace: (...args: any[]) => console.debug(...args) }

export const silentLogger: Logger = {
    debug: () => void 0,
    trace: () => void 0,
    warn: () => void 0,
}
