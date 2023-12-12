import { startOfSecond, startOfMinute, startOfHour, startOfDay, startOfMonth, startOfYear, differenceInSeconds, differenceInMinutes, differenceInHours, differenceInDays, differenceInMonths, differenceInYears, startOfWeek } from 'date-fns'
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz'
import type { Timeframe, TimeframeUnit as Unit } from './timeframes'
import { timeframeToMilliseconds, parseTimeframe } from './timeframes'

export interface TimeframeHelperOptions {
    timezone?: string
    weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6
}

type StartFn = (date: Date | number) => Date
type DiffFn = (from: Date | number, to: Date | number) => number
type GetFn = (date: Date) => number
type SetFn = (date: Date, value: number) => void

export class TimeframeHelper {
    protected static startFns: Record<Exclude<Unit, 'w'>, StartFn> = {
        s: startOfSecond,
        m: startOfMinute,
        h: startOfHour,
        d: startOfDay,
        M: startOfMonth,
        y: startOfYear,
    }

    protected static diffFns: Record<Exclude<Unit, 'w'>, DiffFn> = {
        s: differenceInSeconds,
        m: differenceInMinutes,
        h: differenceInHours,
        d: differenceInDays,
        M: differenceInMonths,
        y: differenceInYears,
    }

    protected static getFns: Record<Exclude<Unit, 'w'>, GetFn> = {
        s: (date) => date.getSeconds(),
        m: (date) => date.getMinutes(),
        h: (date) => date.getHours(),
        d: (date) => date.getDate(),
        M: (date) => date.getMonth(),
        y: (date) => date.getFullYear(),
    }

    protected static setFns: Record<Exclude<Unit, 'w'>, SetFn> = {
        s: (date, value) => date.setSeconds(value),
        m: (date, value) => date.setMinutes(value),
        h: (date, value) => date.setHours(value),
        d: (date, value) => date.setDate(value),
        M: (date, value) => date.setMonth(value),
        y: (date, value) => date.setFullYear(value),
    }

    protected readonly timezone: string
    protected readonly weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6

    public constructor(options: TimeframeHelperOptions = {}) {
        this.timezone = options.timezone ?? 'UTC'
        this.weekStartsOn = options.weekStartsOn ?? 1
    }

    public getCandleTimes(timeframe: Timeframe, from: number, divideBy: number) {
        const openTime = this.getOpenTime(timeframe, from, divideBy)
        const closeTime = this.getCloseTime(timeframe, openTime)

        return { openTime, closeTime }
    }

    public getOpenTime(timeframe: Timeframe, from: number, divideBy: number) {
        const { unit, value: timeframeValue } = parseTimeframe(timeframe)

        if (unit === 'w') {
            if (timeframeValue !== 1) {
                throw new Error(`Invalid timeframe: ${timeframe}`)
            }

            return zonedTimeToUtc(this.startOfWeek(utcToZonedTime(from, this.timezone)), this.timezone).getTime()
        }

        const start = TimeframeHelper.startFns[unit](utcToZonedTime(from, this.timezone))
        const divideByDate = utcToZonedTime(divideBy, this.timezone)

        const diff = Math.abs(TimeframeHelper.diffFns[unit](start, divideByDate))
        const value = TimeframeHelper.getFns[unit](start)

        TimeframeHelper.setFns[unit](start, value - (diff % timeframeValue))

        return zonedTimeToUtc(start, this.timezone).getTime()
    }

    public getCloseTime(timeframe: Timeframe, openTime: number) {
        return openTime + timeframeToMilliseconds(timeframe, openTime) - 1
    }

    protected startOfWeek(timestamp: Date | number) {
        return startOfWeek(timestamp, { weekStartsOn: this.weekStartsOn }).getTime()
    }
}
