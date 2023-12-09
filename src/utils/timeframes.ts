import { Timeframe } from '../constants'

export function sortTimeframes(timeframes: Timeframe[]) {
    const priorities = Object.fromEntries(
        Object.entries(Timeframe).map(([k], i) => [k, i] as const)
    )

    return timeframes.sort((a, b) => priorities[a] - priorities[b])
}
