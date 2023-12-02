import Bottleneck from 'bottleneck'
import { ms, Duration, sleep } from '@khangdt22/utils/time'
import { TypedEventEmitter } from '@khangdt22/utils/event'

export interface LimiterOptions {
    weightPerSecond: number
    isRateLimitError: (error: any) => boolean
    getWaitTime: (error: any) => number
}

export type LimiterEvents = {
    'rate-limit-exceeded': (waitUntil: number, waitTime: number) => void
}

export class Limiter extends TypedEventEmitter<LimiterEvents> {
    protected readonly limiter: Bottleneck
    protected readonly isRateLimitError: (error: any) => boolean
    protected readonly getWaitTime: (error: any) => number

    protected waitUntil?: number

    public constructor(options: LimiterOptions) {
        super()

        const { weightPerSecond, isRateLimitError, getWaitTime } = options

        this.isRateLimitError = isRateLimitError
        this.getWaitTime = getWaitTime

        this.limiter = new Bottleneck({
            minTime: Math.ceil(1000 / weightPerSecond),
            maxConcurrent: weightPerSecond,
            reservoir: weightPerSecond,
            reservoirRefreshAmount: weightPerSecond,
            reservoirRefreshInterval: ms(1, Duration.Second),
        })
    }

    public async call<T>(weight: number, fn: () => Promise<T>): Promise<T> {
        if (this.waitUntil) {
            await sleep(Math.max(0, this.waitUntil - Date.now()))
        }

        return this.limiter.schedule({ weight }, async () => fn().catch((error) => this.handleError(fn, error)))
    }

    protected async handleError<T>(fn: () => Promise<T>, error: any) {
        if (this.isRateLimitError(error)) {
            const waitTime = this.getWaitTime(error)

            this.emit('rate-limit-exceeded', this.waitUntil = Date.now() + waitTime, waitTime)

            return sleep(waitTime).then(async () => (
                this.waitUntil = undefined, await fn()
            ))
        }

        throw error
    }
}