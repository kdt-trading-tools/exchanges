import { isObject, isKeyOf } from '@khangdt22/utils/object'
import { Duration, ms } from '@khangdt22/utils/time'
import { addMonths, toDate, addYears } from 'date-fns'

export const timeframeUnits = ['s', 'm', 'h', 'd', 'w', 'M', 'y'] as const

export const timeframeUnitPriorities = Object.fromEntries(timeframeUnits.map((u, i) => [u, i]))

export type TimeframeUnit = typeof timeframeUnits[number]

export type TimeframeStr = `${number}${TimeframeUnit}`

export type TimeframeObj = { unit: TimeframeUnit; value: number }

export type Timeframe = TimeframeStr | TimeframeObj

export const timeframeDurations: Record<Exclude<TimeframeUnit, 'M' | 'y'>, Duration> = {
    s: Duration.Second,
    m: Duration.Minute,
    h: Duration.Hour,
    d: Duration.Day,
    w: Duration.Week,
}

export function isTimeframeUnit(unit: any): unit is TimeframeUnit {
    return timeframeUnits.includes(unit)
}

export function isValidTimeframeValue(value: number): value is number {
    return Number.isInteger(value) && value > 0
}

export function isTimeframeObject(timeframe: any): timeframe is TimeframeObj {
    return isObject(timeframe) && isTimeframeUnit(timeframe.unit) && isValidTimeframeValue(timeframe.value)
}

export function toTimeframeStr(timeframe: Timeframe): TimeframeStr {
    const { unit, value } = parseTimeframe(timeframe)

    return `${value}${unit}`
}

export function parseTimeframe(timeframe: Timeframe): TimeframeObj {
    if (isTimeframeObject(timeframe)) {
        return timeframe
    }

    const unit = timeframe.slice(-1)
    const value = Number(timeframe.slice(0, -1))

    if (!isTimeframeUnit(unit) || !isValidTimeframeValue(value)) {
        throw new Error(`Invalid timeframe: ${timeframe}`)
    }

    return { unit, value }
}

export const sortTimeframes = <T extends Timeframe[]>(tfs: T): T => tfs.sort((a, b) => {
    const { unit: unitA, value: valueA } = parseTimeframe(a)
    const { unit: unitB, value: valueB } = parseTimeframe(b)

    return timeframeUnitPriorities[unitA] - timeframeUnitPriorities[unitB] || valueA - valueB
})

export function timeframeToMilliseconds(timeframe: Timeframe, startAt?: Date | number) {
    const { unit, value } = parseTimeframe(timeframe)

    if (isKeyOf(timeframeDurations, unit)) {
        return ms(value, timeframeDurations[unit])
    }

    if (!startAt) {
        throw new Error(`Timeframe ${toTimeframeStr(timeframe)} requires startAt to able to convert into milliseconds`)
    }

    startAt = toDate(startAt)

    if (unit === 'M') {
        return addMonths(startAt, value).getTime() - startAt.getTime()
    }

    if (unit === 'y') {
        return addYears(startAt, value).getTime() - startAt.getTime()
    }

    throw new Error(`Timeframe ${toTimeframeStr(timeframe)} is not supported`)
}
