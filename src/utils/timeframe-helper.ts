import { startOfSecond, startOfMinute, startOfHour, startOfDay, startOfMonth, startOfYear, startOfWeek, subDays, addDays, addWeeks, addMonths, addYears, subWeeks, subMonths, subYears } from 'date-fns'
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz'
import { isNullish } from '@khangdt22/utils/condition'
import type { Timeframe, TimeframeUnit as Unit, TimeframeObj } from './timeframes'
import { timeframeToMilliseconds, parseTimeframe, toTimeframeStr } from './timeframes'

type WeekValue = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface TimeframeHelperOptions {
    timezone?: string
    weekStartsOn?: WeekValue
}

type StartFn = (date: Date | number, options?: { weekStartsOn?: WeekValue }) => Date
type GetFn = (date: Date) => number
type SetFn = (date: Date, value: number) => void
type AddOrSubFn = (date: Date | number, value: number) => Date

export class TimeframeHelper {
    protected static startFns: Record<Unit, StartFn> = {
        s: startOfSecond,
        m: startOfMinute,
        h: startOfHour,
        d: startOfDay,
        w: startOfWeek,
        M: startOfMonth,
        y: startOfYear,
    }

    protected static getFns: Record<Exclude<Unit, 's' | 'w' | 'M' | 'y'>, GetFn> = {
        m: (date) => date.getMinutes(),
        h: (date) => date.getHours(),
        d: (date) => date.getDate(),
    }

    protected static setFns: Record<Exclude<Unit, 's' | 'w' | 'M' | 'y'>, SetFn> = {
        m: (date, value) => date.setMinutes(value),
        h: (date, value) => date.setHours(value),
        d: (date, value) => date.setDate(value),
    }

    protected static addFns: Record<Exclude<Unit, 's' | 'm' | 'h'>, AddOrSubFn> = {
        d: addDays,
        w: addWeeks,
        M: addMonths,
        y: addYears,
    }

    protected static subFns: Record<Exclude<Unit, 's' | 'm' | 'h'>, AddOrSubFn> = {
        d: subDays,
        w: subWeeks,
        M: subMonths,
        y: subYears,
    }

    protected readonly timezone: string
    protected readonly weekStartsOn: WeekValue

    public constructor(options: TimeframeHelperOptions = {}) {
        this.timezone = options.timezone ?? 'UTC'
        this.weekStartsOn = options.weekStartsOn ?? 1
    }

    public isSecondUnit({ unit, value }: TimeframeObj) {
        return unit === 's' && value === 1
    }

    public isMinuteUnit({ unit, value }: TimeframeObj) {
        return unit === 'm' && value < 60 && 60 % value === 0
    }

    public isHourUnit({ value, unit }: TimeframeObj) {
        return unit === 'h' && value < 24 && 24 % value === 0
    }

    public isDayUnit({ unit }: TimeframeObj) {
        return unit === 'd'
    }

    public isWeekUnit({ unit }: TimeframeObj) {
        return unit === 'w'
    }

    public isMonthUnit({ unit }: TimeframeObj) {
        return unit === 'M'
    }

    public isYearUnit({ unit }: TimeframeObj) {
        return unit === 'y'
    }

    public isRequiredBaseTime(input: TimeframeObj) {
        if (input.value === 1) {
            return false
        }

        return this.isDayUnit(input) || this.isWeekUnit(input) || this.isMonthUnit(input) || this.isYearUnit(input)
    }

    public getCandleTimes(timeframe: Timeframe, from: number, baseTime?: number) {
        const openTime = this.getOpenTime(timeframe, from, baseTime)
        const closeTime = this.getCloseTime(timeframe, openTime)

        return { openTime, closeTime }
    }

    public getOpenTime(timeframe: Timeframe, from: number, baseTime?: number) {
        const tf = parseTimeframe(timeframe)

        if (tf.value === 1) {
            return this.formatStartDate(this.getStartDate(tf.unit, from)).getTime()
        }

        if (this.isSecondUnit(tf) || this.isMinuteUnit(tf) || this.isHourUnit(tf)) {
            return this.getOpenTimeBySecondOrMinuteOrHourUnit(tf, from)
        }

        if (this.isRequiredBaseTime(tf)) {
            if (isNullish(baseTime)) {
                throw new Error(`Base time is required for timeframe: ${toTimeframeStr(tf)}`)
            }

            return this.getOpenTimeUsingBaseTime(tf, from, baseTime)
        }

        throw new Error(`Invalid timeframe: ${toTimeframeStr(tf)}`)
    }

    public getCloseTime(timeframe: Timeframe, openTime: number) {
        return openTime + timeframeToMilliseconds(timeframe, openTime) - 1
    }

    protected getOpenTimeUsingBaseTime(timeframe: TimeframeObj, from: Date | number, baseTimestamp: Date | number) {
        const { unit, value: timeframeValue } = timeframe
        const fromDate = this.formatStartDate(this.getStartDate(unit, from))
        const fromTime = fromDate.getTime()
        const baseDate = this.formatStartDate(this.getStartDate(unit, baseTimestamp))

        let result: number = baseDate.getTime()

        if (fromTime < result) {
            while (result > fromTime) {
                result = TimeframeHelper.subFns[unit](result, timeframeValue).getTime()
            }
        }

        if (fromTime > result) {
            while (result < fromTime) {
                const added = TimeframeHelper.addFns[unit](result, timeframeValue).getTime()

                if (added > fromTime) {
                    break
                }

                result = added
            }
        }

        return result
    }

    protected getOpenTimeBySecondOrMinuteOrHourUnit(timeframe: TimeframeObj, from: Date | number) {
        const { unit, value: timeframeValue } = timeframe
        const start = this.getStartDate(unit, from)
        const value = TimeframeHelper.getFns[unit](start)

        TimeframeHelper.setFns[unit](start, value - (value % timeframeValue))

        return this.formatStartDate(start).getTime()
    }

    protected formatStartDate(input: Date | number) {
        return zonedTimeToUtc(input, this.timezone)
    }

    protected getStartDate(unit: Unit, input: Date | number) {
        return TimeframeHelper.startFns[unit](utcToZonedTime(input, this.timezone), { weekStartsOn: this.weekStartsOn })
    }
}
