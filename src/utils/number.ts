import type { Numberish } from '@khangdt22/utils/number'
import { bignumber, round as roundNumber } from 'mathjs'
import type { PriceType, QuantityType } from '../types'

export function add(a: Numberish, b: Numberish) {
    return toMathType(a).add(toMathType(b)).toString()
}

export function max(a: Numberish, b: Numberish) {
    return toMathType(a).greaterThan(toMathType(b)) ? a.toString() : b.toString()
}

export function min(a: Numberish, b: Numberish) {
    return toMathType(a).lessThan(toMathType(b)) ? a.toString() : b.toString()
}

export function round(input: Numberish, precision: number) {
    return roundNumber(toMathType(input), precision).toString()
}

export function toMathType(input: Numberish) {
    return bignumber(input.toString())
}

export function toPrice(input: Numberish): PriceType {
    return input.toString()
}

export function toQuantity(input: Numberish): QuantityType {
    return input.toString()
}
