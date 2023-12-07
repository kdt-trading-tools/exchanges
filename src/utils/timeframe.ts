import { endOfMonth, startOfMonth, startOfWeek, startOfDay, differenceInDays } from 'date-fns'
import { map } from '@khangdt22/utils/object'
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz'
import type { Candle } from '../types'
import { Timeframe } from '../constants'

export interface TimeframeHelperOptions {
    timezone?: string
    weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6
}

export class TimeframeHelper {
    protected readonly lengths: Record<string, number>
    protected readonly timezone: string
    protected readonly weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6

    public constructor(protected readonly sampleData: Record<string, Candle>, options: TimeframeHelperOptions = {}) {
        this.lengths = map(sampleData, (timeframe, candle) => [timeframe, candle.closeTime - candle.openTime])
        this.timezone = options.timezone ?? 'UTC'
        this.weekStartsOn = options.weekStartsOn ?? 1
    }

    public isOpenTime(timeframe: Timeframe, timestamp: number) {
        const input = utcToZonedTime(timestamp, this.timezone)

        switch (timeframe) {
            case Timeframe.MIN1:
            case Timeframe.MIN3:
            case Timeframe.MIN5:
            case Timeframe.MIN15:
            case Timeframe.MIN30:
                return input.getMinutes() % this.getValue(timeframe) === 0
            case Timeframe.HOUR1:
            case Timeframe.HOUR2:
            case Timeframe.HOUR4:
            case Timeframe.HOUR6:
            case Timeframe.HOUR8:
            case Timeframe.HOUR12:
                return input.getHours() % this.getValue(timeframe) === 0
            case Timeframe.DAY1:
                return zonedTimeToUtc(startOfDay(input), this.timezone).getTime() === timestamp
            case Timeframe.DAY3:
                if (!this.isOpenTime(Timeframe.DAY1, timestamp)) {
                    return false
                }

                return Math.abs(differenceInDays(timestamp, this.sampleData[Timeframe.DAY3].openTime)) % 3 === 0
            case Timeframe.WEEK1:
                return zonedTimeToUtc(this.startOfWeek(input), this.timezone).getTime() === timestamp
            case Timeframe.MONTH1:
                return zonedTimeToUtc(startOfMonth(input), this.timezone).getTime() === timestamp
            default:
                throw new Error(`Timeframe ${timeframe} is not supported`)
        }
    }

    public getOpenTime(timeframe: Timeframe, closeTime: number) {
        if (timeframe === Timeframe.MONTH1) {
            return zonedTimeToUtc(startOfMonth(utcToZonedTime(closeTime, this.timezone)), this.timezone).getTime()
        }

        return closeTime - this.lengths[timeframe]
    }

    public getCloseTime(timeframe: Timeframe, openTime: number) {
        if (timeframe === Timeframe.MONTH1) {
            return zonedTimeToUtc(endOfMonth(utcToZonedTime(openTime, this.timezone)), this.timezone).getTime()
        }

        return openTime + this.lengths[timeframe]
    }

    public sort(timeframes: Timeframe[]) {
        const priorities = Object.fromEntries(
            Object.entries(Timeframe).map(([k], i) => [k, i] as const)
        )

        return timeframes.sort((a, b) => priorities[a] - priorities[b])
    }

    protected getValue(timeframe: Timeframe) {
        return Number(timeframe.slice(0, -1))
    }

    protected startOfWeek(timestamp: Date) {
        return startOfWeek(timestamp, { weekStartsOn: this.weekStartsOn }).getTime()
    }
}
