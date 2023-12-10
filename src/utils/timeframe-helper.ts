import { endOfMonth, startOfMonth, startOfWeek, startOfDay, differenceInDays, startOfMinute, toDate, startOfHour } from 'date-fns'
import { map } from '@khangdt22/utils/object'
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz'
import type { Candle } from '../types'
import { Timeframe } from '../constants'
import { sortTimeframes, isMinuteTimeframe, getTimeframeValue, isHourTimeframe } from './timeframes'

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

    public getLowestOpenTime(timeframes: Timeframe[], timestamp: number) {
        return Math.min(...timeframes.map((timeframe) => this.getOpenTime(timeframe, timestamp)))
    }

    public getCandleTimes(timeframe: Timeframe, timestamp: number) {
        const openTime = this.getOpenTime(timeframe, timestamp)
        const closeTime = this.getCloseTime(timeframe, openTime)

        return { openTime, closeTime }
    }

    public getOpenTime(timeframe: Timeframe, timestamp: number) {
        const date = toDate(timestamp)

        if (isMinuteTimeframe(timeframe)) {
            return this.getOpenTimeInMinutes(date, getTimeframeValue(timeframe))
        }

        const input = utcToZonedTime(date, this.timezone)

        if (isHourTimeframe(timeframe)) {
            return zonedTimeToUtc(this.getOpenTimeInHours(input, getTimeframeValue(timeframe)), this.timezone).getTime()
        }

        switch (timeframe) {
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
        return sortTimeframes(timeframes)
    }

    protected get3DaysOpenTime(input: Date) {
        const start = startOfDay(input)
        const sample = utcToZonedTime(this.sampleData[Timeframe.DAY3].openTime, this.timezone)
        const diff = Math.abs(differenceInDays(start, sample))
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

    protected startOfWeek(timestamp: Date) {
        return startOfWeek(timestamp, { weekStartsOn: this.weekStartsOn }).getTime()
    }
}
