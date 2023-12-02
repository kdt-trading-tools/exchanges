import { isObject } from '@khangdt22/utils/object'
import type { ErrorResponse } from '../types'

export function isErrorResponse(response: any): response is ErrorResponse {
    return isObject(response) && 'error' in response && 'code' in response.error && 'msg' in response.error
}
