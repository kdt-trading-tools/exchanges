import type { ClientErrorContext } from './client-error'
import { ClientError } from './client-error'

export class RequestError extends ClientError {
    public declare request?: any
    public declare response?: any

    public constructor(context: ClientErrorContext, request?: any, message?: string, options?: ErrorOptions) {
        super(context, message, options)

        if (request) {
            this.request = request
        }
    }

    public setResponse(response: any) {
        if (response) {
            this.response = response
        }

        return this
    }
}
