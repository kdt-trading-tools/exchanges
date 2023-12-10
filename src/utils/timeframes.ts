import { Timeframe } from '../constants'

export function isMinuteTimeframe(timeframe: Timeframe) {
    return timeframe.endsWith('m')
}

export function isHourTimeframe(timeframe: Timeframe) {
    return timeframe.endsWith('h')
}

export function getTimeframeValue(timeframe: Timeframe) {
    return Number(timeframe.slice(0, -1))
}

export function sortTimeframes(timeframes: Timeframe[]) {
    const priorities = Object.fromEntries(
        Object.entries(Timeframe).map(([k], i) => [k, i] as const)
    )

    return timeframes.sort((a, b) => priorities[a] - priorities[b])
}
