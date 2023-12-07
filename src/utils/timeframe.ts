import { endOfMonth, startOfMonth, startOfWeek, startOfDay, differenceInDays, startOfMinute, toDate, startOfHour } from 'date-fns'
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
        return this.getOpenTime(timeframe, timestamp) === timestamp
    }

    public getOpenTime(timeframe: Timeframe, timestamp: number) {
        const date = toDate(timestamp)
        const input = utcToZonedTime(date, this.timezone)

        switch (timeframe) {
            case Timeframe.MIN1:
                return this.getOpenTimeInMinutes(date, 1)
            case Timeframe.MIN3:
                return this.getOpenTimeInMinutes(date, 3)
            case Timeframe.MIN5:
                return this.getOpenTimeInMinutes(date, 5)
            case Timeframe.MIN15:
                return this.getOpenTimeInMinutes(date, 15)
            case Timeframe.MIN30:
                return this.getOpenTimeInMinutes(date, 30)
            case Timeframe.HOUR1:
                return zonedTimeToUtc(this.getOpenTimeInHours(input, 1), this.timezone).getTime()
            case Timeframe.HOUR2:
                return zonedTimeToUtc(this.getOpenTimeInHours(input, 2), this.timezone).getTime()
            case Timeframe.HOUR4:
                return zonedTimeToUtc(this.getOpenTimeInHours(input, 4), this.timezone).getTime()
            case Timeframe.HOUR6:
                return zonedTimeToUtc(this.getOpenTimeInHours(input, 6), this.timezone).getTime()
            case Timeframe.HOUR8:
                return zonedTimeToUtc(this.getOpenTimeInHours(input, 8), this.timezone).getTime()
            case Timeframe.HOUR12:
                return zonedTimeToUtc(this.getOpenTimeInHours(input, 12), this.timezone).getTime()
            case Timeframe.DAY1:
                return zonedTimeToUtc(startOfDay(input), this.timezone).getTime()
            case Timeframe.DAY3:
                return zonedTimeToUtc(this.get3DaysOpenTime(input), this.timezone).getTime()
            case Timeframe.WEEK1:
                return zonedTimeToUtc(this.startOfWeek(input), this.timezone).getTime()
            case Timeframe.MONTH1:
                return zonedTimeToUtc(startOfMonth(input), this.timezone).getTime()
            default:
                throw new Error(`Timeframe ${timeframe} is not supported`)
        }
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

    protected get3DaysOpenTime(input: Date) {
        const start = startOfDay(input)
        const diff = Math.abs(differenceInDays(input, this.sampleData[Timeframe.DAY3].openTime))
        const days = start.getDate()

        start.setDate(days - (diff % 3))

        return start.getTime()
    }

    protected getOpenTimeInHours(input: Date, value: number) {
        const time = startOfHour(input)
        const hours = time.getHours()

        time.setHours(hours - (hours % value))

        return time.getTime()
    }

    protected getOpenTimeInMinutes(input: Date, value: number) {
        const time = startOfMinute(input)
        const minutes = time.getMinutes()

        time.setMinutes(minutes - (minutes % value))

        return time.getTime()
    }

    protected getValue(timeframe: Timeframe) {
        return Number(timeframe.slice(0, -1))
    }

    protected startOfWeek(timestamp: Date) {
        return startOfWeek(timestamp, { weekStartsOn: this.weekStartsOn }).getTime()
    }
}
