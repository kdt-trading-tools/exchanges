import { isObject } from '@khangdt22/utils/object'
import type { ContractInfoStream } from '../types'

export function isContractInfoStreamEvent(data: any): data is ContractInfoStream {
    return isObject(data) && 'e' in data && data.e === 'contractInfo'
}
